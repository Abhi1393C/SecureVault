const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Document, User, AuditLog } = require('../models/schema'); 
const cryptoUtils = require('../utils/cryptoUtils');
const sharingUtils = require('../utils/sharingUtils');
const pdfProcessor = require('../utils/pdfProcessor');

const r2Client = new S3Client({
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

exports.signDocumentFlow = async (req, res) => {
    try {
        const { documentId } = req.params;
        const { pin, signatureImage, positionX, positionY, pageNumber, imageScale, pdfViewerWidth, pdfViewerHeight } = req.body; 
        const userId = req.user.userId; 

        if (!pin) return res.status(400).json({ error: "Master PIN is required." });
        if (!signatureImage) return res.status(400).json({ error: "Signature image missing." });

        const doc = await Document.findById(documentId);
        if (!doc) return res.status(404).json({ error: "Document not found" });

        const user = await User.findById(userId);
        const isOwner = doc.ownerId.toString() === userId.toString();
        const sharedAccess = doc.sharedWith ? doc.sharedWith.find(s => s.userId.toString() === userId.toString()) : null;
        
        if (!isOwner && (!sharedAccess || sharedAccess.role === 'Viewer')) {
            return res.status(403).json({ error: "You lack permission to sign this document." });
        }

        // 1. Unlock User's RSA Private Key using Master PIN
        let privateKeyPem;
        try {
            const userAesKey = cryptoUtils.deriveKeyFromPIN(pin, user._id.toString());
            const privateKeyBuffer = cryptoUtils.decryptData(Buffer.from(user.wrappedPrivateKey, 'base64'), userAesKey);
            privateKeyPem = privateKeyBuffer.toString('utf-8');
        } catch (error) {
            return res.status(401).json({ error: "Invalid PIN. Cannot unlock digital identity." });
        }

        // 2. Fetch File from R2
        let fileBuffer;
        try {
            const r2Response = await r2Client.send(new GetObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: doc.fileUrl
            }));
            fileBuffer = await streamToBuffer(r2Response.Body);
        } catch (err) {
            return res.status(404).json({ error: "File not found in Cloudflare R2 bucket." });
        }

        // 3. SMART BACKUP: Save original clean file copy if not already backed up
        if (!doc.originalFileUrl) {
            const originalBackupKey = `originals/${doc._id}-${Date.now()}.pdf`;
            await r2Client.send(new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: originalBackupKey,
                Body: fileBuffer,
                ContentType: 'application/octet-stream'
            }));
            doc.originalFileUrl = originalBackupKey;
        }

        let originalPdfBuffer = fileBuffer;
        let fileKey = null;
        const isEncryptedMode = doc.storageMode === 'Encrypted' || doc.encrypted;

        // 4. DECRYPT PDF using native cryptoUtils & sharingUtils
        if (isEncryptedMode && doc.encryptionMeta && doc.encryptionMeta.iv) {
            try {
                if (isOwner) {
                    // Owner Flow: ownerWrappedKey was created by frontendCrypto.js using
                    // PBKDF2(PIN, "secure-vault-master-salt-v1", 100000, SHA-256) → AES-256-GCM wrap.
                    // Layout: [12-byte IV][AES-GCM ciphertext+16-byte authTag]
                    const crypto = require('crypto');
                    const salt = Buffer.from("secure-vault-master-salt-v1");
                    const derivedPinKey = crypto.pbkdf2Sync(pin, salt, 100000, 32, 'sha256');

                    const rawWrapped = Buffer.from(doc.ownerWrappedKey, 'base64');
                    const keyIv = rawWrapped.subarray(0, 12);
                    const ciphertextWithTag = rawWrapped.subarray(12);
                    const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);
                    const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);

                    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedPinKey, keyIv);
                    decipher.setAuthTag(authTag);
                    const aesKeyBase64 = decipher.update(ciphertext, null, 'utf8') + decipher.final('utf8');
                    fileKey = Buffer.from(aesKeyBase64, 'base64');
                } else {
                    // Shared Recipient Flow: wrappedKey was created by shareController using
                    // RSA-PKCS1 encryption of the raw AES key with the recipient's public key.
                    fileKey = sharingUtils.unwrapFileKeyForUser(sharedAccess.wrappedKey, privateKeyPem);
                }

                // The stored file data is raw ciphertext (no IV/authTag prefix for frontend-encrypted files).
                // encryptionMeta.iv === 'FRONTEND_HANDLED' means the file payload already contains
                // the IV prepended by the browser (frontendCrypto.js layout: [12-byte IV][ciphertext+authTag]).
                // For backend-re-encrypted files (after previous signs), encryptionMeta.iv is a real base64 IV.
                if (doc.encryptionMeta.iv === 'FRONTEND_HANDLED') {
                    // Layout from browser: first 12 bytes = IV, remaining = ciphertext+authTag (Web Crypto appends tag)
                    const fileIv = fileBuffer.subarray(0, 12);
                    const webCryptoPayload = fileBuffer.subarray(12);
                    const fileCiphertext = webCryptoPayload.subarray(0, webCryptoPayload.length - 16);
                    const fileAuthTag = webCryptoPayload.subarray(webCryptoPayload.length - 16);

                    const fileDecipher = require('crypto').createDecipheriv('aes-256-gcm', fileKey, fileIv);
                    fileDecipher.setAuthTag(fileAuthTag);
                    originalPdfBuffer = Buffer.concat([fileDecipher.update(fileCiphertext), fileDecipher.final()]);
                } else {
                    // Layout from backend cryptoUtils.encryptData: [12-byte IV][16-byte authTag][ciphertext]
                    const fullEncryptedBuffer = Buffer.concat([
                        Buffer.from(doc.encryptionMeta.iv, 'base64'),
                        Buffer.from(doc.encryptionMeta.authTag, 'base64'),
                        fileBuffer
                    ]);
                    originalPdfBuffer = cryptoUtils.decryptData(fullEncryptedBuffer, fileKey);
                }
            } catch (err) {
                console.error("ZK Decryption Error:", err);
                return res.status(400).json({ error: "Decryption failed. Ensure correct PIN is entered." });
            }
        }

        // 5. VISUAL STAMPING
        let stampedPdfBuffer;
        try {
            stampedPdfBuffer = await pdfProcessor.stampVisualSignature(
                originalPdfBuffer, 
                signatureImage, 
                { signerName: user.name },
                { 
                    x: positionX, 
                    y: positionY, 
                    page: (pageNumber !== undefined && pageNumber !== null && !isNaN(pageNumber)) ? Math.max(0, parseInt(pageNumber, 10) - 1) : 0,
                    pdfViewerWidth: pdfViewerWidth,
                    pdfViewerHeight: pdfViewerHeight,
                    imageScale: imageScale
                }
            );
        } catch (err) {
            console.error("PDF Stamping Error:", err);
            return res.status(400).json({ error: "Failed to stamp PDF. The document might be corrupted." });
        }

        // 6. DIGITAL SIGNATURE
        const documentHash = cryptoUtils.generateDocumentHash(stampedPdfBuffer).toString('hex');
        const digitalSignature = cryptoUtils.signDocument(documentHash, privateKeyPem);

        // 7. RE-ENCRYPT & UPLOAD TO R2
        let finalBufferToUpload = stampedPdfBuffer;
        let newIv = doc.encryptionMeta?.iv;
        let newAuthTag = doc.encryptionMeta?.authTag;

        if (isEncryptedMode && fileKey) {
            const crypto = require('crypto');
            const isFrontendEncrypted = doc.encryptionMeta?.iv === 'FRONTEND_HANDLED';

            if (isFrontendEncrypted) {
                // Keep Web Crypto layout: [12-byte IV][ciphertext+authTag]
                // This is the format frontendCrypto.decryptFileInBrowser expects on download.
                const newFileIv = crypto.randomBytes(12);
                const cipher = crypto.createCipheriv('aes-256-gcm', fileKey, newFileIv);
                const encrypted = Buffer.concat([cipher.update(stampedPdfBuffer), cipher.final()]);
                const fileAuthTagNew = cipher.getAuthTag(); // 16 bytes
                // Upload as: [IV][ciphertext][authTag]  ← matches Web Crypto output
                finalBufferToUpload = Buffer.concat([newFileIv, encrypted, fileAuthTagNew]);
                // encryptionMeta stays FRONTEND_HANDLED — download path will handle it
                newIv = 'FRONTEND_HANDLED';
                newAuthTag = 'FRONTEND_HANDLED';
            } else {
                // Backend-encrypted: use cryptoUtils.encryptData layout [IV][authTag][ciphertext]
                const newEncryptedPdfBuffer = cryptoUtils.encryptData(stampedPdfBuffer, fileKey);
                newIv = newEncryptedPdfBuffer.subarray(0, 12).toString('base64');
                newAuthTag = newEncryptedPdfBuffer.subarray(12, 28).toString('base64');
                finalBufferToUpload = newEncryptedPdfBuffer.subarray(28);
            }
        }

        try {
            await r2Client.send(new PutObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: doc.fileUrl,
                Body: finalBufferToUpload,
                ContentType: 'application/octet-stream'
            }));
        } catch (err) {
            return res.status(500).json({ error: "Failed to save signed file to R2." });
        }

        // 8. UPDATE MONGODB SCHEMA & AUDIT LOG
        if (isEncryptedMode && doc.encryptionMeta) {
            doc.encryptionMeta.iv = newIv;
            doc.encryptionMeta.authTag = newAuthTag;
        }

        doc.isSigned = true;
        doc.signature = {
            signedBy: user._id,
            signatureHash: digitalSignature,
            signedAt: new Date()
        };
        await doc.save();

        await AuditLog.create({
            performedBy: user._id,
            documentId: doc._id,
            documentName: doc.fileName,
            action: 'SIGNED_DOCUMENT',
            prevHash: doc.fileHash || 'NULL',
            currentHash: documentHash
        });

        return res.status(200).json({ success: true, message: "Document digitally signed and vaulted securely!" });

    } catch (error) {
        console.error("Critical Signature Flow Error:", error);
        return res.status(500).json({ error: "An unexpected internal server error occurred." });
    }
};

exports.unsignDocument = async (req, res) => {
    try {
        const { documentId } = req.params;
        const userId = req.user.userId;
        const doc = await Document.findById(documentId);
        if (!doc) return res.status(404).json({ error: "Document not found" });

        const isOwner = doc.ownerId.toString() === userId.toString();
        if (!isOwner) return res.status(403).json({ error: "Only owner can remove signature." });

        // Restore original clean backup file if available
        if (doc.originalFileUrl) {
            try {
                const backupResponse = await r2Client.send(new GetObjectCommand({
                    Bucket: process.env.R2_BUCKET_NAME,
                    Key: doc.originalFileUrl
                }));
                const originalBuffer = await streamToBuffer(backupResponse.Body);

                await r2Client.send(new PutObjectCommand({
                    Bucket: process.env.R2_BUCKET_NAME,
                    Key: doc.fileUrl,
                    Body: originalBuffer,
                    ContentType: 'application/octet-stream'
                }));
            } catch (err) {
                console.error("Backup restore warning:", err);
            }
        }

        doc.isSigned = false;
        doc.signature = null;
        doc.originalFileUrl = null;
        await doc.save();

        await AuditLog.create({
            performedBy: userId,
            documentId: doc._id,
            documentName: doc.fileName,
            action: 'UNSIGNED_DOCUMENT',
            prevHash: 'NULL',
            currentHash: 'SIGNATURE_REMOVED'
        });

        return res.status(200).json({ success: true, message: "Signature removed and clean state restored." });
    } catch (error) {
        console.error("Unsign Error:", error);
        return res.status(500).json({ error: "Failed to remove signature." });
    }
};

exports.verifyPublicDocument = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "No document provided for verification." });
        
        // 1. Generate SHA-256 hash of the uploaded file
        const fileHash = cryptoUtils.generateDocumentHash(req.file.buffer).toString('hex');

        // 2. Query the Audit Log for this exact hash
        const signLog = await AuditLog.findOne({
            action: 'SIGNED_DOCUMENT',
            currentHash: fileHash
        }).sort({ timestamp: -1 });

        if (!signLog) {
            return res.status(404).json({ 
                error: "Verification Failed: Document hash not found. The file is either unsigned or has been tampered with.", 
                currentHash: fileHash 
            });
        }

        // 3. Retrieve Document and Signer Details
        const doc = await Document.findById(signLog.documentId);
        if (!doc || !doc.isSigned || !doc.signature) {
            return res.status(404).json({ error: "Verification Failed: Document record altered.", currentHash: fileHash });
        }

        const signer = await User.findById(doc.signature.signedBy);
        if (!signer) {
            return res.status(404).json({ error: "Verification Failed: Signer identity lost.", currentHash: fileHash });
        }

        // 4. Mathematically Verify the Ed25519 Signature
        const isValid = cryptoUtils.verifyDocumentSignature(
            fileHash, // Pass the hex string directly to match the signing process
            signer.publicKey,
            doc.signature.signatureHash
        );

        if (!isValid) {
            return res.status(400).json({ error: "Cryptographic signature validation failed.", currentHash: fileHash });
        }

        return res.status(200).json({
            isValid: true,
            signerName: signer.name,
            signerEmail: signer.email,
            signedAt: doc.signature.signedAt,
            fileHash: fileHash
        });

    } catch (error) {
        console.error("Public Verification Error:", error);
        return res.status(500).json({ error: "Internal verification error." });
    }
};