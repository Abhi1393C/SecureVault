const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { Document, User, AuditLog } = require('../models/schema'); 
const cryptoUtils = require('../utils/cryptoUtils');
const sharingUtils = require('../utils/sharingUtils');

// Cloudflare R2 Configuration (S3 compatible)
const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

/**
 * POST /api/documents/upload
 */
const uploadDocument = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No document provided" });
        }

        const ownerId = req.user.userId; 
        const fileBuffer = req.file.buffer;
        const originalName = req.file.originalname;
        const mode = req.body.mode || 'standard'; // Frontend se mode aayega (standard/encrypted)

        const owner = await User.findById(ownerId);
        if (!owner || !owner.publicKey) {
            return res.status(400).json({ error: "Owner or Public Key not found" });
        }

        const fileHash = cryptoUtils.generateDocumentHash(fileBuffer).toString('hex');
        
        // Variables setup (Default to Standard)
        let finalBuffer = fileBuffer;
        let finalStorageMode = 'Unencrypted';
        let ownerWrappedKey = 'NONE';
        let r2FileKey = `vault/${ownerId}/${Date.now()}_${originalName}`;
        let encryptionMeta = { iv: 'NONE', authTag: 'NONE' };

        // Sirf tab handle karo jab user ne 'encrypted' select kiya ho
        if (mode === 'encrypted') {
            // 🚀 Frontend ne file pehle hi encrypt kar di hai!
            finalBuffer = fileBuffer;
            finalStorageMode = 'Encrypted';
            r2FileKey += '.enc'; 

            // Frontend se aayi hui PIN-wrapped AES key ko direct save kar lo
            ownerWrappedKey = req.body.ownerWrappedKey || 'MISSING_KEY';
            
            // IV aur AuthTag frontend ne file ke bytes ke sath attach kar diye hain
            encryptionMeta = { iv: 'FRONTEND_HANDLED', authTag: 'FRONTEND_HANDLED' };
        }

        // Upload to Cloudflare R2
        await s3.send(new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: r2FileKey,
            Body: finalBuffer,
            ContentType: req.file.mimetype || 'application/octet-stream'
        }));

        // Save metadata to MongoDB
        const newDoc = new Document({
            ownerId: owner._id,
            fileName: originalName,
            originalSize: req.file.size,
            storageMode: finalStorageMode, // Ab yahan dynamic mode jayega
            fileUrl: r2FileKey, 
            ownerWrappedKey: ownerWrappedKey,
            encryptionMeta: encryptionMeta,
            isSigned: false,
            type: 'file', 
            parentId: req.body.parentId || null 
        });
        await newDoc.save();

        // Increment user's used storage quota
        await User.findByIdAndUpdate(owner._id, {
            $inc: { usedStorage: req.file.size || finalBuffer.length || 0 }
        });

        // Audit Trail Entry
        const auditLog = new AuditLog({
            performedBy: owner._id,
            documentId: newDoc._id,
            documentName: originalName,
            action: 'UPLOAD_DOCUMENT',
            prevHash: 'NULL', 
            currentHash: fileHash
        });
        await auditLog.save();

        return res.status(201).json({
            message: `Document successfully uploaded in ${finalStorageMode} mode.`,
            documentId: newDoc._id
        });

    } catch (error) {
        console.error("Upload Error:", error);
        return res.status(500).json({ error: "Internal Server Error during upload." });
    }
};

/**
 * POST /api/documents/create-folder
 */
const createFolder = async (req, res) => {
    try {
        const { folderName, parentId } = req.body;
        const ownerId = req.user.userId;

        const newFolder = new Document({
            ownerId: ownerId,
            fileName: folderName,
            type: 'folder',
            parentId: parentId || null, 
            storageMode: 'Unencrypted',
            fileUrl: 'NONE',
            ownerWrappedKey: 'NONE',
            isSigned: false
        });

        await newFolder.save();

        await AuditLog.create({
            performedBy: ownerId,
            documentId: newFolder._id,
            documentName: folderName,
            action: 'CREATE_FOLDER',
            prevHash: 'NULL',
            currentHash: 'FOLDER_ROOT'
        });

        return res.status(201).json({ message: "Folder created", folder: newFolder });
    } catch (error) {
        console.error("Create Folder Error:", error);
        return res.status(500).json({ error: "Failed to create folder." });
    }
};

/**
 * POST /api/documents/move
 */
const moveDocument = async (req, res) => {
    try {
        const { documentId, newParentId } = req.body;
        const ownerId = req.user.userId;

        const doc = await Document.findOne({ _id: documentId, ownerId: ownerId });
        if (!doc) {
            return res.status(404).json({ error: "Document not found." });
        }

        doc.parentId = newParentId || null;
        await doc.save();

        try {
            await AuditLog.create({
                performedBy: ownerId,
                documentId: doc._id,
                documentName: doc.fileName,
                action: 'MOVED_DOCUMENT',
                prevHash: 'NULL',
                currentHash: 'LOCATION_CHANGED',
                timestamp: new Date()
            });
        } catch (auditErr) {
            console.error("Audit log error on moveDocument:", auditErr);
        }

        return res.status(200).json({ message: "Document moved successfully", document: doc });
    } catch (error) {
        console.error("Move Document Error:", error);
        return res.status(500).json({ error: "Failed to move document." });
    }
};

const getDocuments = async (req, res) => {
    try {
        const userId = req.user.userId;

        // 🚀 FIX: Populate sharedWith.userId to get names and emails of recipients
        const docs = await Document.find({
            isDeleted: false,
            $or: [
                { ownerId: userId },
                { 'sharedWith.userId': userId }
            ]
        }).populate('ownerId', 'name email').populate('sharedWith.userId', 'name email');

        const formattedDocs = docs.map(doc => {
            const isOwner = doc.ownerId._id.toString() === userId.toString();
            let userRole = 'Owner';
            let ownerName = 'me';

            if (!isOwner) {
                const sharedInfo = doc.sharedWith.find(s => s.userId && s.userId._id.toString() === userId.toString());
                userRole = sharedInfo ? sharedInfo.role : 'Viewer';
                ownerName = doc.ownerId.name || doc.ownerId.email || 'Unknown';
            }

            // 🚀 FIX: Map the populated shared users to send to frontend
            const sharedUsers = doc.sharedWith
                .filter(s => s.userId) // Ensure user still exists
                .map(s => ({
                    id: s.userId._id.toString(),
                    name: s.userId.name || 'User',
                    email: s.userId.email,
                    role: s.role
                }));

            return {
                id: doc._id,
                name: doc.fileName,
                size: doc.fileSize || 'Unknown',
                type: doc.type || (doc.fileName.includes('.') ? 'file' : 'folder'),
                date: doc.updatedAt.toISOString().split('T')[0],
                owner: ownerName,
                role: userRole,
                encrypted: doc.storageMode === 'Encrypted',
                storageMode: doc.storageMode,
                parentId: doc.parentId,
                signed: doc.isSigned || false,
                sharedUsers: sharedUsers // Pushing to frontend
            };
        });

        res.status(200).json(formattedDocs);
    } catch (error) {
        console.error("Fetch Documents Error:", error);
        res.status(500).json({ error: "Failed to fetch documents" });
    }
};

/*POST /api/documents/access
  Updates the last accessed timestamp for the "Recent" view
 */
const updateLastAccessed = async (req, res) => {
    try {
        const { documentId } = req.body;
        const ownerId = req.user.userId;

        // Find the doc and update the lastAccessed field to now
        await Document.findOneAndUpdate(
            { _id: documentId, ownerId: ownerId }, 
            { lastAccessed: new Date() },
            { new: true }
        );

        return res.status(200).json({ message: "Access time updated" });
    } catch (error) {
        console.error("Update Access Error:", error);
        return res.status(500).json({ error: "Failed to update access time." });
    }
};

module.exports = {
    uploadDocument,
    createFolder,
    moveDocument,
    getDocuments,
    updateLastAccessed
};