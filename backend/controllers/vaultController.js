const { S3Client, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Document, User, AuditLog } = require('../models/schema');
const crypto = require('crypto');

// 1. Initialize Cloudflare R2 Client
const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    }
});

const streamToBuffer = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
};

const downloadDocument = async (req, res) => {
    try {
        const documentId = req.params.id;
        const userId = req.user.userId;

        const doc = await Document.findById(documentId);
        if (!doc) return res.status(404).json({ error: "Document not found" });

        const isOwner = doc.ownerId.toString() === userId.toString();
        const sharedAccess = doc.sharedWith ? doc.sharedWith.find(s => s.userId.toString() === userId.toString()) : false;
        
        if (!isOwner && !sharedAccess) {
            return res.status(403).json({ error: "Access Denied." });
        }

        const r2Response = await s3.send(new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: doc.fileUrl
        }));
        const fileBuffer = await streamToBuffer(r2Response.Body);

        // 🚀 Ensure Audit Log is recorded for every view/download (Encrypted & Standard)
        // 🚀 Cryptographic Hash-Chained Audit Log Entry
        try {
            const lastLog = await AuditLog.findOne().sort({ createdAt: -1 });
            const prevHash = lastLog ? lastLog.currentHash : '0'.repeat(64); // Genesis hash fallback if empty
            
            const timestamp = new Date();
            const dataToHash = `${prevHash}-${userId}-${doc._id}-VIEWED/DOWNLOADED-${timestamp.getTime()}`;
            const currentHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

            await AuditLog.create({
                userId: userId,
                performedBy: userId, // Schema requirement
                action: 'VIEWED/DOWNLOADED',
                documentId: doc._id,
                documentName: doc.fileName,
                prevHash: prevHash,     // Schema requirement
                currentHash: currentHash, // Schema requirement
                timestamp: timestamp
            });
        } catch (auditErr) {
            console.error("Audit log creation error:", auditErr);
        }

        if (doc.storageMode === 'Encrypted') {
            let finalOwnerWrappedKey = null;
            let finalRawFileKey = null;

            if (isOwner) {
                finalOwnerWrappedKey = doc.ownerWrappedKey;
            } else {
                // Recipient Flow: Backend safely unwraps the RSA key for the recipient
                const enteredPin = req.body.pin;
                if (!enteredPin) return res.status(400).json({ error: "PIN required to decrypt shared file." });
                
                try {
                    const recipientUser = await User.findById(userId);
                    const cryptoUtils = require('../utils/cryptoUtils');
                    const sharingUtils = require('../utils/sharingUtils');
                    
                    // Unlock Recipient's Private Key using their PIN
                    const recipientAesKey = cryptoUtils.deriveKeyFromPIN(enteredPin, userId.toString());
                    const privateKeyBuffer = cryptoUtils.decryptData(Buffer.from(recipientUser.wrappedPrivateKey, 'base64'), recipientAesKey);
                    const privateKeyPem = privateKeyBuffer.toString('utf-8');

                    // RSA-Decrypt the file key
                    const rawFileKeyBuffer = sharingUtils.unwrapFileKeyForUser(sharedAccess.wrappedKey, privateKeyPem);
                    finalRawFileKey = rawFileKeyBuffer.toString('base64');
                } catch (err) {
                    console.error("Recipient Decryption Error:", err);
                    return res.status(401).json({ error: "Invalid PIN. Failed to unlock shared key." });
                }
            }

            return res.status(200).json({
                fileName: doc.fileName,
                fileData: fileBuffer.toString('base64'),
                ownerWrappedKey: finalOwnerWrappedKey,
                rawFileKey: finalRawFileKey, // Sent specifically for recipients
                encryptionMeta: doc.encryptionMeta
            });
        } else {
            // Standard Unencrypted Download logic remains same
            res.setHeader('Content-Type', r2Response.ContentType || 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
            return res.send(fileBuffer);
        }

    } catch (error) {
        console.error("Vault Download Error:", error);
        res.status(500).json({ error: "Failed to fetch document." });
    }
};

const renameDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const { newName } = req.body;
        const userId = req.user.userId;

        const doc = await Document.findById(id);
        if (!doc) return res.status(404).json({ error: "Document not found" });

        if (doc.ownerId.toString() !== userId.toString()) {
            return res.status(403).json({ error: "Only the document owner can rename it." });
        }

        if (!newName || !newName.trim()) {
            return res.status(400).json({ error: "File name cannot be empty." });
        }

        const trimmedName = newName.trim();
        const originalExtension = doc.fileName.includes('.') 
            ? doc.fileName.substring(doc.fileName.lastIndexOf('.')) 
            : '';
        const baseNewName = trimmedName.includes('.') 
            ? trimmedName.substring(0, trimmedName.lastIndexOf('.')) 
            : trimmedName;

        doc.fileName = baseNewName + originalExtension;
        await doc.save();

        try {
            await AuditLog.create({
                performedBy: userId,
                documentId: doc._id,
                documentName: doc.fileName,
                action: 'RENAMED_DOCUMENT',
                prevHash: 'NULL',
                currentHash: 'NAME_UPDATED',
                timestamp: new Date()
            });
        } catch (auditErr) {
            console.error("Audit log error on rename:", auditErr);
        }

        res.json({ message: "Document renamed successfully", doc });
    } catch (error) {
        console.error("Rename Error:", error);
        res.status(500).json({ error: "Failed to rename document." });
    }
};

const getDocumentInfo = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const doc = await Document.findById(id).populate('ownerId', 'email');
        if (!doc) return res.status(404).json({ error: "Document not found" });

        const isOwner = doc.ownerId._id.toString() === userId.toString();
        const sharedAccess = doc.sharedWith ? doc.sharedWith.find(s => s.userId.toString() === userId.toString()) : false;
        
        if (!isOwner && !sharedAccess) {
            return res.status(403).json({ error: "Access Denied." });
        }

        res.json({
            id: doc._id,
            name: doc.fileName,
            size: doc.fileSize || '1.2 MB', 
            type: doc.fileName.split('.').pop().toUpperCase(),
            storageMode: doc.storageMode,
            owner: isOwner ? 'me' : doc.ownerId.email,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
            signed: doc.signed
        });
    } catch (error) {
        console.error("Info Error:", error);
        res.status(500).json({ error: "Failed to fetch document info." });
    }
};

const moveToBin = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const doc = await Document.findById(id);
        if (!doc) return res.status(404).json({ error: "Document not found" });
        if (doc.ownerId.toString() !== userId.toString()) {
            return res.status(403).json({ error: "Unauthorized action." });
        }

        const now = new Date();
        doc.isDeleted = true;
        doc.deletedAt = now;
        await doc.save();

        // 🚀 If folder, recursively move all child files and subfolders to bin
        if (doc.type === 'folder') {
            const moveChildrenToBin = async (folderId) => {
                const children = await Document.find({ parentId: folderId, ownerId: userId, isDeleted: false });
                for (const child of children) {
                    child.isDeleted = true;
                    child.deletedAt = now;
                    await child.save();
                    if (child.type === 'folder') {
                        await moveChildrenToBin(child._id);
                    }
                }
            };
            await moveChildrenToBin(doc._id);
        }

        try {
            await AuditLog.create({
                performedBy: userId,
                documentId: doc._id,
                documentName: doc.fileName,
                action: 'MOVED_TO_BIN',
                prevHash: 'NULL',
                currentHash: 'BINNED',
                timestamp: now
            });
        } catch (auditErr) {
            console.error("Audit log error on moveToBin:", auditErr);
        }

        res.json({ message: "Moved to bin successfully" });
    } catch (error) {
        console.error("Move to Bin Error:", error);
        res.status(500).json({ error: "Failed to move item to bin." });
    }
};

const getBinDocuments = async (req, res) => {
    try {
        const userId = req.user.userId;
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const expiredDocs = await Document.find({
            ownerId: userId,
            isDeleted: true,
            deletedAt: { $lt: sevenDaysAgo }
        });

        for (const expired of expiredDocs) {
            if (expired.fileUrl && expired.fileUrl !== 'NONE') {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: process.env.R2_BUCKET_NAME,
                        Key: expired.fileUrl
                    }));
                } catch (err) { console.error("R2 auto-purge error:", err); }
            }
            try {
                await AuditLog.create({
                    performedBy: userId,
                    documentId: expired._id,
                    documentName: expired.fileName,
                    action: 'PERMANENTLY_DELETED',
                    prevHash: 'DOCUMENT_EXPIRED_7_DAYS',
                    currentHash: 'PURGED_FROM_STORAGE',
                    timestamp: new Date()
                });
            } catch (auditErr) {
                console.error("Audit log error on auto-purge:", auditErr);
            }
            await Document.findByIdAndDelete(expired._id);
        }

        const binDocs = await Document.find({ ownerId: userId, isDeleted: true }).sort({ deletedAt: -1 });
        
        const formattedBinDocs = binDocs.map(doc => ({
            id: doc._id,
            name: doc.fileName,
            type: doc.type || (doc.fileName.includes('.') ? 'file' : 'folder'),
            deletedAt: doc.deletedAt
        }));

        res.json(formattedBinDocs);
    } catch (error) {
        console.error("Get Bin Error:", error);
        res.status(500).json({ error: "Failed to fetch bin documents." });
    }
};

const restoreDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const doc = await Document.findById(id);
        if (!doc) return res.status(404).json({ error: "Document not found" });
        if (doc.ownerId.toString() !== userId.toString()) {
            return res.status(403).json({ error: "Unauthorized action." });
        }

        doc.isDeleted = false;
        doc.deletedAt = null;
        await doc.save();

        // 🚀 If folder, recursively restore all descendant children
        if (doc.type === 'folder') {
            const restoreChildren = async (folderId) => {
                const children = await Document.find({ parentId: folderId, ownerId: userId, isDeleted: true });
                for (const child of children) {
                    child.isDeleted = false;
                    child.deletedAt = null;
                    await child.save();
                    if (child.type === 'folder') {
                        await restoreChildren(child._id);
                    }
                }
            };
            await restoreChildren(doc._id);
        }

        try {
            await AuditLog.create({
                performedBy: userId,
                documentId: doc._id,
                documentName: doc.fileName,
                action: 'RESTORED_DOCUMENT',
                prevHash: 'NULL',
                currentHash: 'RESTORED',
                timestamp: new Date()
            });
        } catch (auditErr) {
            console.error("Audit log error on restore:", auditErr);
        }

        res.json({ message: "Document restored successfully", doc });
    } catch (error) {
        console.error("Restore Error:", error);
        res.status(500).json({ error: "Failed to restore document." });
    }
};

const permanentDeleteDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.userId;

        const doc = await Document.findById(id);
        if (!doc) return res.status(404).json({ error: "Document not found" });
        if (doc.ownerId.toString() !== userId.toString()) {
            return res.status(403).json({ error: "Unauthorized action." });
        }

        // 🚀 Feature 6: Track freed storage during recursive deletion
        let freedBytes = 0;

        const deleteRecursively = async (targetDoc) => {
            if (targetDoc.type === 'folder') {
                const children = await Document.find({ parentId: targetDoc._id, ownerId: userId });
                for (const child of children) {
                    await deleteRecursively(child);
                }
            } else if (targetDoc.fileUrl && targetDoc.fileUrl !== 'NONE') {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: process.env.R2_BUCKET_NAME,
                        Key: targetDoc.fileUrl
                    }));
                } catch (err) { console.error("R2 Delete Error:", err); }
                if (targetDoc.originalSize) freedBytes += targetDoc.originalSize;
            }

            // Cryptographic Audit Log for permanent purge (Immutable retention)
            try {
                await AuditLog.create({
                    performedBy: userId,
                    documentId: targetDoc._id,
                    documentName: targetDoc.fileName,
                    action: 'PERMANENTLY_DELETED',
                    prevHash: 'DOCUMENT_DESTROYED',
                    currentHash: 'PURGED_FROM_STORAGE',
                    timestamp: new Date()
                });
            } catch (auditErr) {
                console.error("Audit log error on permanent delete:", auditErr);
            }

            await Document.findByIdAndDelete(targetDoc._id);
        };

        await deleteRecursively(doc);

        // Decrement usedStorage, clamped to 0
        if (freedBytes > 0) {
            const user = await User.findById(userId);
            if (user) {
                const newUsed = Math.max(0, (user.usedStorage || 0) - freedBytes);
                await User.findByIdAndUpdate(userId, { $set: { usedStorage: newUsed } });
            }
        }

        res.json({ message: "Permanently deleted successfully" });
    } catch (error) {
        console.error("Permanent Delete Error:", error);
        res.status(500).json({ error: "Failed to delete permanently." });
    }
};

const emptyBin = async (req, res) => {
    try {
        const userId = req.user.userId;
        const binDocs = await Document.find({ ownerId: userId, isDeleted: true });

        // 🚀 Feature 6: Track freed storage
        let freedBytes = 0;

        for (const doc of binDocs) {
            if (doc.fileUrl && doc.fileUrl !== 'NONE') {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: process.env.R2_BUCKET_NAME,
                        Key: doc.fileUrl
                    }));
                } catch (err) {}
            }
            if (doc.originalSize) freedBytes += doc.originalSize;

            try {
                await AuditLog.create({
                    performedBy: userId,
                    documentId: doc._id,
                    documentName: doc.fileName,
                    action: 'PERMANENTLY_DELETED',
                    prevHash: 'DOCUMENT_DESTROYED',
                    currentHash: 'PURGED_FROM_STORAGE',
                    timestamp: new Date()
                });
            } catch (auditErr) {
                console.error("Audit log error on emptyBin:", auditErr);
            }

            await Document.findByIdAndDelete(doc._id);
        }

        // Decrement usedStorage, clamped to 0
        if (freedBytes > 0) {
            const user = await User.findById(userId);
            if (user) {
                const newUsed = Math.max(0, (user.usedStorage || 0) - freedBytes);
                await User.findByIdAndUpdate(userId, { $set: { usedStorage: newUsed } });
            }
        }

        res.json({ message: "Bin emptied successfully" });
    } catch (error) {
        console.error("Empty Bin Error:", error);
        res.status(500).json({ error: "Failed to empty bin." });
    }
};

module.exports = { 
    downloadDocument, 
    renameDocument,
    getDocumentInfo,
    moveToBin,
    getBinDocuments,
    restoreDocument,
    permanentDeleteDocument,
    emptyBin
};