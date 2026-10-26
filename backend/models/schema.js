const mongoose = require('mongoose');
const { Schema } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  otp: { type: String, default: null },
  otpExpiresAt: { type: Date, default: null },
  pinHash: { type: String, default: null }, // Argon2id hash for Auth verification
  
  // Asymmetric Keys for Sharing & Signing (Zero-Knowledge)
  publicKey: { type: String, default: null }, // Sabko dikhegi (For RSA sharing)
  salt: { type: String, default: null },
  wrappedPrivateKey: { type: String, default: null }, // User ke PIN se lock hoke save hogi
  
  resetToken: { type: String, default: null },
  resetTokenExpiresAt: { type: Date, default: null },
  usedStorage: { type: Number, default: 0 },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

const documentSchema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  fileName: { type: String, required: true },
  type: { type: String, enum: ['file', 'folder'], default: 'file' },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
  originalSize: { type: Number },
  storageMode: { type: String, enum: ['Encrypted', 'Unencrypted'], required: true },
  fileUrl: { type: String, required: true }, // Cloudflare R2 key/path
  
  // The unique AES File Key, locked with the Owner's Public Key
  ownerWrappedKey: { type: String, default: null }, 
  
  // Added 'iv' and 'authTag' directly here for AES-GCM decryption of the file
  encryptionMeta: {
    iv: { type: String, default: null }, 
    authTag: { type: String, default: null } 
  },

  lastAccessed: { type: Date},
  
  isSigned: { type: Boolean, default: false },
  signature: {
    signedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    signatureHash: { type: String, default: null }, // Ed25519 or RSA-signed SHA-256 hash
    signedAt: { type: Date, default: null },
  },

  sharedWith: [
    {
      userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      role: { type: String, enum: ['Owner', 'Editor', 'Viewer'], required: true },
      // Us specific user ki Public Key se lock ki gayi AES File Key
      wrappedKey: { type: String, required: true }, 
      sharedAt: { type: Date, default: Date.now },
    },
  ],

  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },

  originalFileUrl: { type: String, default: null }
}, { timestamps: true });

const Document = mongoose.model('Document', documentSchema);

const shareLinkSchema = new Schema({
  shareId: { type: String, required: true, unique: true },
  documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tokenHash: { type: String, required: true }, // Secure token ka hash
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

// Auto-delete documents when time expires using MongoDB TTL index
shareLinkSchema.index({ "expiresAt": 1 }, { expireAfterSeconds: 0 });

const ShareLink = mongoose.model('ShareLink', shareLinkSchema);

const auditLogSchema = new Schema({
  performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  documentId: { type: Schema.Types.ObjectId, ref: 'Document', default: null },
  documentName: { type: String, default: null }, // Immutable filename snapshot
  action: { type: String, required: true },
  prevHash: { type: String, required: true },
  currentHash: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

const sessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  token: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const Session = mongoose.model('Session', sessionSchema);

// Export all models including the new ShareLink
module.exports = { User, Document, ShareLink, AuditLog, Session };