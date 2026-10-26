const crypto = require('crypto');

// ==========================================
// 1. CORE SETUP & INTERNAL SHARING (RSA)
// ==========================================

function generateSharingKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
}

function generateUniqueFileKey() {
    return crypto.randomBytes(32); 
}

/**
 * INTERNAL SHARING: Wraps File Key with receiver's Public Key using standard PKCS1 padding.
 */
function wrapFileKeyForUser(storageMode, fileKeyBuffer, publicKeyPem) {
    if (storageMode === 'Unencrypted') {
        return null; 
    }

    // Standard default PKCS#1 v1.5 padding matching file upload encryption
    const encryptedKey = crypto.publicEncrypt({
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_PADDING
    }, fileKeyBuffer);
    
    return encryptedKey.toString('base64');
}

/**
 * UNWRAP FILE KEY: Unlocks the file key using Private Key with matching padding.
 */
function unwrapFileKeyForUser(wrappedKeyBase64, privateKeyPem) {
    const wrappedKeyBuffer = Buffer.from(wrappedKeyBase64, 'base64');
    
    return crypto.privateDecrypt({
        key: privateKeyPem,
        padding: crypto.constants.RSA_PKCS1_PADDING
    }, wrappedKeyBuffer);
}

// ==========================================
// 2. EXTERNAL SHARING (EXPIRING LINKS)
// ==========================================

function createExternalShare(storageMode, expiryHours = 24) {
    if (storageMode === 'Encrypted') {
        throw new Error("SECURITY_POLICY_VIOLATION: Encrypted documents cannot be shared externally.");
    }

    const shareId = crypto.randomUUID();
    const secureToken = crypto.randomBytes(32).toString('hex'); 
    const tokenHash = crypto.createHash('sha256').update(secureToken).digest('hex');

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiryHours);

    return {
        dbData: {
            shareId: shareId,
            tokenHash: tokenHash,
            expiresAt: expiresAt
        },
        frontendLinkToken: secureToken 
    };
}

function verifyExternalShareToken(providedToken, dbTokenHash) {
    const providedHash = crypto.createHash('sha256').update(providedToken).digest('hex');
    return providedHash === dbTokenHash;
}

module.exports = {
    generateSharingKeyPair,
    generateUniqueFileKey,
    wrapFileKeyForUser,
    unwrapFileKeyForUser,
    createExternalShare,
    verifyExternalShareToken
};