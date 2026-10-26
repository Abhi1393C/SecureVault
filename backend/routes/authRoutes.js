const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const verifyToken = require('../middlewares/authMiddleware');

router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.post('/verify-otp', authController.verifyOTP);
router.post('/resend-otp', authController.resendOTP);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/refresh-token', authController.refreshAccessToken);
router.put('/profile', verifyToken, authController.updateProfile);
router.get('/profile', verifyToken, authController.getProfile); // Feature 6: storage quota
router.post('/verify-pin', verifyToken, authController.verifyPin);
router.post('/reset-pin', verifyToken, authController.resetPin);

module.exports = router;