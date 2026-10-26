const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

exports.deriveKeyFromPIN = (pin, salt) => {
    if (!pin || !salt) throw new Error("PIN or Salt missing.");
    return crypto.scryptSync(pin, salt, KEY_LENGTH);
};

exports.encryptData = (buffer, aesKey) => {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGO, aesKey, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]);
};

exports.decryptData = (encryptedBuffer, aesKey) => {
    const iv = encryptedBuffer.subarray(0, IV_LENGTH);
    const authTag = encryptedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = encryptedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    
    const decipher = crypto.createDecipheriv(ALGO, aesKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
};

exports.generateAndWrapUserKeys = (masterPin, userSalt) => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    const aesKey = this.deriveKeyFromPIN(masterPin, userSalt);
    const wrappedPrivateKeyBuffer = this.encryptData(Buffer.from(privateKey), aesKey);
    return {
        publicKey,
        wrappedPrivateKey: wrappedPrivateKeyBuffer.toString('base64')
    };
};

exports.generateDocumentHash = (fileBuffer) => {
    return crypto.createHash('sha256').update(fileBuffer).digest();
};

exports.signDocument = (documentHashBuffer, privateKeyPem) => {
    return crypto.sign(null, documentHashBuffer, privateKeyPem).toString('base64');
};

exports.verifyDocumentSignature = (documentHashBuffer, publicKeyPem, signatureBase64) => {
    return crypto.verify(
        null, 
        documentHashBuffer, 
        publicKeyPem, 
        Buffer.from(signatureBase64, 'base64')
    );
};