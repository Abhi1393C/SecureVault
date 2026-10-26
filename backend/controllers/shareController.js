const { Document, User, AuditLog, ShareLink } = require('../models/schema');
const cryptoUtils = require('../utils/cryptoUtils');
const sharingUtils = require('../utils/sharingUtils');
const crypto = require('crypto');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { sendEmail } = require('../utils/emailUtils');

// Initialize Cloudflare R2 Client for public file fetching
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

/**
 * POST /api/share/internal
 * Body: { documentId, targetEmail, role: 'Viewer' | 'Editor', pin: "123456" (If encrypted) }
 */
const shareInternal = async (req, res) => {
    try {
        const { documentId, targetEmail, role = 'Viewer', pin } = req.body;
        const ownerId = req.user.userId; // From JWT Auth middleware

        // 1. Fetch Document and Target User
        const doc = await Document.findById(documentId);
        if (!doc) return res.status(404).json({ error: "Document not found." });

        // Only Owner can share the document in this version
        if (doc.ownerId.toString() !== ownerId.toString()) {
            return res.status(403).json({ error: "Only the owner can share this document." });
        }

        const targetUser = await User.findOne({ email: targetEmail });
        if (!targetUser) {
            return res.status(404).json({ error: "User with this email not found in SecureVault." });
        }

        // Check if already shared
        const alreadyShared = doc.sharedWith.find(s => s.userId.toString() === targetUser._id.toString());
        if (alreadyShared) {
            return res.status(400).json({ error: "Document already shared with this user." });
        }

        let wrappedKeyForTarget = null;

        // ==========================================
        // 2. CRYPTO LOGIC (If Document is Encrypted)
        // ==========================================
        if (doc.storageMode === 'Encrypted') {
            if (!pin) {
                return res.status(400).json({ error: "Master PIN is required to share an encrypted document." });
            }

            try {
                // A. Decrypt Owner's AES-wrapped file key (Matching Frontend's PBKDF2 logic)
                const salt = Buffer.from("secure-vault-master-salt-v1");
                const derivedPinKey = crypto.pbkdf2Sync(pin, salt, 100000, 32, 'sha256');

                const rawData = Buffer.from(doc.ownerWrappedKey, 'base64');
                const iv = rawData.subarray(0, 12);
                const ciphertextWithTag = rawData.subarray(12);
                const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);
                const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);

                const decipher = crypto.createDecipheriv('aes-256-gcm', derivedPinKey, iv);
                decipher.setAuthTag(authTag);
                let fileKeyBase64 = decipher.update(ciphertext, null, 'utf8');
                fileKeyBase64 += decipher.final('utf8');
                
                const fileKeyBuffer = Buffer.from(fileKeyBase64, 'base64');

                // B. Wrap (Lock) the extracted File Key with the Target User's RSA Public Key
                wrappedKeyForTarget = sharingUtils.wrapFileKeyForUser(doc.storageMode, fileKeyBuffer, targetUser.publicKey);
            } catch (error) {
                console.error("Crypto Share Error:", error);
                return res.status(401).json({ error: "Invalid PIN or corrupted owner key." });
            }
        }

        // ==========================================
        // 3. DATABASE UPDATE
        // ==========================================
        
        // Add user to the Access Control List (sharedWith array)
        doc.sharedWith.push({
            userId: targetUser._id,
            role: role,
            wrappedKey: wrappedKeyForTarget  || 'NONE' // Null for unencrypted, Base64 String for encrypted
        });

        await doc.save();

        // 4. Save Audit Log
        await AuditLog.create({
            performedBy: ownerId,
            documentId: doc._id,
            documentName: doc.fileName,
            action: 'SHARED_INTERNALLY',
            prevHash: doc.fileHash || 'NULL',
            currentHash: doc.fileHash || 'NULL' // Hash doesn't change on share
        });

        // 5. Asynchronous Email Notification (Feature 5)
        const dashboardUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
        sendEmail({
            email: targetUser.email,
            subject: `Document Shared: "${doc.fileName}" on SecureVault`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 12px; border: 1px solid #334155;">
                    <div style="text-align: center; margin-bottom: 24px;">
                        <h2 style="color: #10b981; margin: 0; font-size: 24px;">SecureVault</h2>
                        <p style="color: #94a3b8; font-size: 14px; margin-top: 4px;">Zero-Knowledge Secure Cloud Storage</p>
                    </div>
                    <div style="background-color: #1e293b; padding: 20px; border-radius: 8px; border: 1px solid #334155;">
                        <p style="font-size: 16px; margin: 0 0 16px 0;">Hello <strong>${targetUser.name}</strong>,</p>
                        <p style="font-size: 14px; color: #cbd5e1; line-height: 1.6; margin: 0 0 16px 0;">
                            A document has been securely shared with you on SecureVault with <strong>${role}</strong> access.
                        </p>
                        <div style="background-color: #0f172a; padding: 12px 16px; border-radius: 6px; margin-bottom: 20px; border: 1px solid #334155;">
                            <p style="margin: 4px 0; font-size: 14px;"><strong style="color: #94a3b8;">Document Name:</strong> ${doc.fileName}</p>
                            <p style="margin: 4px 0; font-size: 14px;"><strong style="color: #94a3b8;">Assigned Role:</strong> <span style="color: #10b981; font-weight: bold;">${role}</span></p>
                            <p style="margin: 4px 0; font-size: 14px;"><strong style="color: #94a3b8;">Storage Mode:</strong> ${doc.storageMode}</p>
                        </div>
                        <div style="text-align: center; margin-top: 24px;">
                            <a href="${dashboardUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 12px 28px; font-weight: bold; border-radius: 8px; font-size: 14px;">Open Dashboard</a>
                        </div>
                    </div>
                    <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 20px;">
                        This is an automated notification from SecureVault. If you did not expect this, you can safely ignore this email.
                    </p>
                </div>
            `
        }).catch(err => console.error("Async sharing email notification error:", err));

        res.status(200).json({
            message: `Document successfully shared with ${targetUser.name}`,
            role: role
        });

    } catch (error) {
        console.error("Internal Share Error:", error);
        res.status(500).json({ error: "Internal Server Error during sharing." });
    }
};

/**
 * POST /api/share/external
 * Body: { documentId, expiryHours = 24 }
 */
const createExternalLink = async (req, res) => {
    try {
        const { documentId, expiryHours = 24 } = req.body;
        const ownerId = req.user.userId;

        // 1. Fetch Document
        const doc = await Document.findById(documentId);
        if (!doc) return res.status(404).json({ error: "Document not found." });

        if (doc.ownerId.toString() !== ownerId.toString()) {
            return res.status(403).json({ error: "Only the owner can create external links." });
        }

        // 2. STRICT SECURITY ENFORCEMENT
        if (doc.storageMode === 'Encrypted') {
            return res.status(403).json({ 
                error: "Security Policy Violation: Encrypted files cannot be shared externally. Use Internal Sharing instead." 
            });
        }

        // 3. Generate Secure Token (Zero-Knowledge style for link)
        const shareData = sharingUtils.createExternalShare(doc.storageMode, expiryHours);

        // 4. Save to Database
        await ShareLink.create({
            shareId: shareData.dbData.shareId,
            documentId: doc._id,
            createdBy: ownerId,
            tokenHash: shareData.dbData.tokenHash,
            expiresAt: shareData.dbData.expiresAt
        });

        // 5. Save Audit Log
        await AuditLog.create({
            performedBy: ownerId,
            documentId: doc._id,
            documentName: doc.fileName,
            action: 'CREATED_EXTERNAL_LINK',
            prevHash: doc.fileHash || 'NULL',
            currentHash: doc.fileHash || 'NULL'
        });

        // 6. Generate the Frontend URL
        const frontendUrl = `${process.env.FRONTEND_URL}/view/${shareData.dbData.shareId}#${shareData.frontendLinkToken}`;

        res.status(201).json({
            message: `External link created successfully. Valid for ${expiryHours} hours.`,
            link: frontendUrl,
            expiresAt: shareData.dbData.expiresAt
        });

    } catch (error) {
        console.error("External Share Error:", error);
        res.status(500).json({ error: "Internal Server Error during link generation." });
    }
};

/**
 * POST /api/share/view/:shareId
 * Body: { token: "secure_token_from_url_hash" }
 * 🚀 PUBLIC ROUTE (No JWT required)
 */
const viewExternalDocument = async (req, res) => {
    try {
        const { shareId } = req.params;
        console.log("--> Backend received shareId:", JSON.stringify(shareId));
        const { token } = req.body;

        if (!token) return res.status(400).json({ error: "Security token is missing from the link." });

        // 1. Find the link in DB
        const linkRecord = await ShareLink.findOne({ shareId: shareId.trim() });
        console.log("--> Database query result:", linkRecord.shareId);
        if (!linkRecord) return res.status(404).json({ error: "This link is invalid or does not exist." });

        // 2. Check Expiration
        if (new Date() > linkRecord.expiresAt) {
            return res.status(410).json({ error: "This shared link has expired." });
        }

        // 3. Verify Token Hash
        const isValid = sharingUtils.verifyExternalShareToken(token, linkRecord.tokenHash);
        if (!isValid) {
            return res.status(403).json({ error: "Invalid security token. Access Denied." });
        }

        // 4. Fetch Document Details
        const doc = await Document.findById(linkRecord.documentId).populate('ownerId', 'name email');
        if (!doc) return res.status(404).json({ error: "The original document has been deleted." });

        if (doc.storageMode === 'Encrypted') {
            return res.status(403).json({ error: "Security Policy Violation: Encrypted files cannot be viewed publicly." });
        }

        // 5. Fetch File from Cloudflare R2
        const r2Response = await s3.send(new GetObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: doc.fileUrl
        }));
        const fileBuffer = await streamToBuffer(r2Response.Body);

        // 6. Save Audit Log
        await AuditLog.create({
            performedBy: doc.ownerId._id,
            documentId: doc._id,
            documentName: doc.fileName,
            action: 'EXTERNAL_LINK_VIEWED',
            prevHash: doc.fileHash || 'NULL',
            currentHash: doc.fileHash || 'NULL'
        });

        res.status(200).json({
            fileName: doc.fileName,
            ownerName: doc.ownerId.name || doc.ownerId.email,
            fileType: doc.fileName.split('.').pop(),
            fileData: fileBuffer.toString('base64')
        });

    } catch (error) {
        console.error("External View Error:", error);
        res.status(500).json({ error: "Failed to load the external document." });
    }
};

module.exports = {
    shareInternal,
    createExternalLink,
    viewExternalDocument
};