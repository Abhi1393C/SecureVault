const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const { generateAndWrapUserKeys } = require('../utils/cryptoUtils');
const bcrypt = require('bcrypt');
const argon2 = require('argon2'); // MASTER PIN ke liye Argon2 zaroori hai
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User, Session, Document, ShareLink, AuditLog } = require('../models/schema');
const cryptoUtils = require('../utils/cryptoUtils');
const sharingUtils = require('../utils/sharingUtils');
const { sendOTP, sendEmail } = require('../utils/emailUtils'); 

// Cloudflare R2 Client for data purge during PIN reset
const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    }
});

// Helper: 6-digit OTP generator
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ==========================================
// 1. SIGNUP (Step 1: Create keys, hash, and send OTP)
// ==========================================
const signup = async (req, res) => {
    try {
        const { name, email, password, pin } = req.body;

        const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_-])[A-Za-z\d@$!%*?&#^_-]{12,}$/;
        if (!passRegex.test(password)) {
            return res.status(400).json({ 
                error: "Password must be at least 12 characters long and contain uppercase, lowercase, numbers, and symbols." 
            });
        }

        let user = await User.findOne({ email });
        if (user) {
            // Agar user already exist karta hai aur verified bhi hai
            if (user.isVerified) {
                return res.status(400).json({ error: "User already exists and is verified." });
            }
            // Agar exist karta hai par verified nahi hai, toh hum usko niche update kar denge
        }

        const userId = user ? user._id : new mongoose.Types.ObjectId();
        const saltRounds = 10;
        
        // SECURITY FIX: Password bcrypt se, PIN argon2id se
        const passwordHash = await bcrypt.hash(password, saltRounds);
        const pinHash = await argon2.hash(pin, { type: argon2.argon2id });

        // Zero-Knowledge Keys Generate & Wrap karna (Tumhara original logic)
        const { publicKey, privateKey } = sharingUtils.generateSharingKeyPair();
        const userAesKey = cryptoUtils.deriveKeyFromPIN(pin, userId.toString());
        
        const wrappedPrivateKeyBuffer = cryptoUtils.encryptData(Buffer.from(privateKey, 'utf-8'), userAesKey);
        const wrappedPrivateKey = wrappedPrivateKeyBuffer.toString('base64');

        // Generate OTP
        const otp = generateOTP();
        const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins valid

        if (user) {
            // Update the unverified user with new details & new OTP
            user.name = name;
            user.passwordHash = passwordHash;
            user.pinHash = pinHash;
            user.publicKey = publicKey;
            user.wrappedPrivateKey = wrappedPrivateKey;
            user.otp = otp;
            user.otpExpiresAt = otpExpiresAt;
            await user.save();
        } else {
            // Save new user to DB (by default isVerified: false in schema)
            const newUser = new User({
                _id: userId,
                name, email, passwordHash, pinHash,
                publicKey, wrappedPrivateKey,
                otp, otpExpiresAt,
                isVerified: false
            });
            await newUser.save();
        }

        // Send Email
        await sendOTP(email, otp);

        res.status(201).json({ message: "OTP sent to your email. Please verify." });
    } catch (error) {
        console.error("Signup Error:", error);
        res.status(500).json({ error: "Signup failed." });
    }
};

const verifyOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: "User not found." });
        if (user.isVerified) return res.status(400).json({ error: "User is already verified." });

        // Debugging ke liye (Optional, tum chaho toh hata sakte ho)
        const cleanReceivedOTP = otp.toString().trim();
        const cleanDbOTP = user.otp ? user.otp.toString().trim() : null;
        
        /*console.log("What's the OTP in the DB?:", cleanDbOTP);
        console.log("What did the user send?:", cleanReceivedOTP);
        console.log("Did the OTP match?:", cleanDbOTP === cleanReceivedOTP);*/

        // NAYA LOGIC: Time expiry hata di gayi hai. Bas exact match check hoga.
        if (cleanDbOTP !== cleanReceivedOTP) {
            return res.status(400).json({ error: "Invalid OTP. Please check the code." });
        }

        // Verification successful
        user.isVerified = true;
        user.otp = null;
        user.otpExpiresAt = null;
        await user.save();

        res.status(200).json({ message: "Email verified successfully! You can now login." });
    } catch (error) {
        console.error("Verify OTP Error:", error);
        res.status(500).json({ error: "Verification failed." });
    }
};

// ==========================================
// 3. RESEND OTP
// ==========================================
const resendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ error: "User not found." });
        if (user.isVerified) return res.status(400).json({ error: "User is already verified." });

        const newOtp = generateOTP();
        user.otp = newOtp;
        user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await user.save();

        await sendOTP(email, newOtp);

        res.status(200).json({ message: "A new OTP has been sent." });
    } catch (error) {
        console.error("Resend OTP Error:", error);
        res.status(500).json({ error: "Failed to resend OTP." });
    }
};

// ==========================================
// 4. LOGIN
// ==========================================
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: "Invalid credentials." });

        if (!user.isVerified) {
            return res.status(403).json({ error: "Please verify your email before logging in." });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return res.status(401).json({ error: "Invalid credentials." });

        // 1. Short-Lived Access Token (15 minutes)
        const token = jwt.sign(
            { userId: user._id, email: user.email, name: user.name }, // 🚀 FIX: Added name
            process.env.JWT_SECRET || 'super_secret_jwt_key', 
            { expiresIn: '15m' } 
        );
        
        // 2. Long-Lived Refresh Token (7 days)
        const refreshToken = jwt.sign(
            { userId: user._id }, 
            process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_key', 
            { expiresIn: '7d' }
        );

        // Save Refresh Token to Session in DB
        await Session.create({ userId: user._id, token: refreshToken });

        res.status(200).json({
            message: "Login successful",
            token,           // Access Token
            refreshToken,    // Refresh Token
            user: { id: user._id, name: user.name, email: user.email }
        });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ error: "Login failed." });
    }
};

// ==========================================
// 1. FORGOT PASSWORD (Generate Token & Email)
// ==========================================
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User with this email does not exist." });
    }

    // Generate a random reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Save token and expiry (1 hour from now) in Database
    user.resetToken = resetToken;
    user.resetTokenExpiresAt = Date.now() + 3600000; 
    await user.save();

    // Frontend reset link
    const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

    // Tumhara existing emailUtil use karke email bhejna
    const htmlContent = `
      <h2>Password Reset Request</h2>
      <p>You requested to reset your SecureVault login password.</p>
      <p>Click the link below to set a new password. This link is valid for 1 hour.</p>
      <a href="${resetUrl}" style="padding: 10px 15px; background-color: #059669; color: white; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
      <p style="color: #64748b; font-size: 12px; margin-top: 20px;">If you did not request this, please ignore this email. Your Master PIN remains safe.</p>
    `;

    // Note: Parameter names apne emailUtil ke hisaab se adjust kar lena (e.g., to, subject, html)
    await sendEmail({
      email: user.email, 
      subject: 'SecureVault - Password Reset Request',
      html: htmlContent
    });

    res.status(200).json({ message: "Reset link sent to your email." });

  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ error: "Failed to send email. Please try again." });
  }
};

// ==========================================
// 2. RESET PASSWORD (Verify Token & Update)
// ==========================================
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiresAt: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token." });
    }

    // Hash the new password using bcrypt
    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);

    // Clear the reset token fields
    user.resetToken = null;
    user.resetTokenExpiresAt = null;
    await user.save();

    res.status(200).json({ message: "Password has been reset successfully. You can now log in." });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ error: "Failed to reset password." });
  }
};

const refreshAccessToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(401).json({ error: "No refresh token provided." });

        // Verify the refresh token's signature
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'super_secret_refresh_key');
        
        // Check if the session is still active in the database
        const session = await Session.findOne({ userId: decoded.userId, token: refreshToken, isActive: true });
        if (!session) return res.status(401).json({ error: "Session expired or revoked." });

        const user = await User.findById(decoded.userId);

        // Issue a new 15-minute access token
        const newAccessToken = jwt.sign(
            { userId: user._id, email: user.email }, 
            process.env.JWT_SECRET || 'super_secret_jwt_key', 
            { expiresIn: '15m' }
        );

        res.status(200).json({ token: newAccessToken });
    } catch (error) {
        console.error("Refresh Error:", error);
        res.status(401).json({ error: "Invalid or expired refresh token. Please log in again." });
    }
};

const updateProfile = async (req, res) => {
    try {
        const { name } = req.body;
        
        // verifyToken middleware se hume logged-in user ki ID mil jayegi
        // JWT token payload ke hisaab se req.user.userId use kar rahe hain
        const userId = req.user.userId; 

        if (!name || !name.trim()) {
            return res.status(400).json({ error: "Name cannot be empty." });
        }

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { name: name.trim() },
            { new: true }
        ).select('-passwordHash -pinHash');

        if (!updatedUser) {
            return res.status(404).json({ error: "User not found." });
        }

        res.status(200).json({ 
            message: "Profile updated successfully", 
            user: { id: updatedUser._id, name: updatedUser.name, email: updatedUser.email } 
        });
    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ error: "Failed to update profile." });
    }
};

// ==========================================
// 6. VERIFY MASTER PIN (For Zero-Knowledge Actions)
// ==========================================
const verifyPin = async (req, res) => {
    try {
        const { pin } = req.body;
        const userId = req.user.userId; // verifyToken middleware se aayega

        if (!pin) {
            return res.status(400).json({ error: "PIN is required." });
        }

        const user = await User.findById(userId);
        if (!user || !user.pinHash) {
            return res.status(404).json({ error: "User or PIN not found." });
        }

        // Compare entered PIN with the securely stored Argon2 hash
        const isMatch = await argon2.verify(user.pinHash, pin);
        
        if (!isMatch) {
            return res.status(401).json({ error: "Incorrect Master PIN." });
        }

        res.status(200).json({ message: "PIN verified successfully." });
    } catch (error) {
        console.error("Verify PIN Error:", error);
        res.status(500).json({ error: "Failed to verify PIN." });
    }
};

/**
 * POST /api/auth/reset-pin
 * Body: { password, newPin }
 * Auth: verifyToken
 * 
 * WARNING: Resetting the Master PIN results in total data loss for all user documents
 * because existing encrypted documents cannot be decrypted without the old PIN.
 */
const resetPin = async (req, res) => {
    try {
        const { password, newPin } = req.body;
        const userId = req.user.userId;

        if (!password || !newPin) {
            return res.status(400).json({ error: "Password and new 6-digit Master PIN are required." });
        }

        if (!/^\d{6}$/.test(newPin)) {
            return res.status(400).json({ error: "Master PIN must be exactly 6 numeric digits." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        // Verify account password
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        if (!isPasswordValid) {
            return res.status(401).json({ error: "Incorrect account password." });
        }

        // 1. Purge all documents owned by this user (both Cloudflare R2 objects & MongoDB records)
        const userDocs = await Document.find({ ownerId: userId });
        for (const doc of userDocs) {
            if (doc.fileUrl && doc.fileUrl !== 'NONE') {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: process.env.R2_BUCKET_NAME,
                        Key: doc.fileUrl
                    }));
                } catch (r2Err) {
                    console.error(`R2 delete error for doc ${doc._id}:`, r2Err);
                }
            }
        }
        await Document.deleteMany({ ownerId: userId });

        // 2. Remove access from documents shared with this user (since keys are being reset)
        await Document.updateMany(
            { 'sharedWith.userId': userId },
            { $pull: { sharedWith: { userId: userId } } }
        );

        // 3. Remove user's ShareLinks
        await ShareLink.deleteMany({ createdBy: userId });

        // 4. Generate fresh Zero-Knowledge asymmetric key pair & wrap with new PIN
        const pinHash = await argon2.hash(newPin, { type: argon2.argon2id });
        const { publicKey, privateKey } = sharingUtils.generateSharingKeyPair();
        const userAesKey = cryptoUtils.deriveKeyFromPIN(newPin, userId.toString());
        const wrappedPrivateKeyBuffer = cryptoUtils.encryptData(Buffer.from(privateKey, 'utf-8'), userAesKey);
        const wrappedPrivateKey = wrappedPrivateKeyBuffer.toString('base64');

        user.pinHash = pinHash;
        user.publicKey = publicKey;
        user.wrappedPrivateKey = wrappedPrivateKey;
        user.usedStorage = 0; // Feature 6: Purge storage usage on PIN reset
        await user.save();

        // 5. Audit Log Entry
        await AuditLog.create({
            performedBy: userId,
            documentId: null,
            action: 'RESET_MASTER_PIN_DATA_PURGED',
            prevHash: 'ALL_DOCUMENTS_PURGED',
            currentHash: 'NEW_KEYPAIR_GENERATED'
        });

        res.status(200).json({ 
            message: "Master PIN reset successfully. All previous encrypted data has been purged and fresh security keys initialized." 
        });
    } catch (error) {
        console.error("Reset PIN Error:", error);
        res.status(500).json({ error: "Failed to reset Master PIN." });
    }
};

// ==========================================
// getProfile — returns storage usage for Feature 6
// ==========================================
const getProfile = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId).select('name email usedStorage');
        if (!user) return res.status(404).json({ error: "User not found" });
        res.status(200).json({
            name: user.name,
            email: user.email,
            usedStorage: user.usedStorage || 0
        });
    } catch (error) {
        console.error("Get Profile Error:", error);
        res.status(500).json({ error: "Failed to fetch profile." });
    }
};

module.exports = { 
    signup, 
    verifyOTP, 
    resendOTP, 
    login, 
    forgotPassword, 
    resetPassword, 
    refreshAccessToken,
    updateProfile,
    verifyPin,
    resetPin,
    getProfile
};