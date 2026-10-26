const express = require('express');
const router = express.Router();
const multer = require('multer');
const documentController = require('../controllers/documentController');
const authMiddleware = require('../middlewares/authMiddleware'); 
const verifyToken = require('../middlewares/authMiddleware');
const signatureController = require('../controllers/signatureController');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } 
});

// 1. Upload File
router.post('/upload', authMiddleware, upload.single('file'), documentController.uploadDocument);

// 2. Fetch All Documents
router.get('/', authMiddleware, documentController.getDocuments);

// 3. Folder Operations
router.post('/create-folder', authMiddleware, documentController.createFolder);
router.post('/move', authMiddleware, documentController.moveDocument);
router.post('/access', verifyToken, documentController.updateLastAccessed);

router.post('/:documentId/sign', authMiddleware, signatureController.signDocumentFlow);
router.post('/:documentId/unsign', authMiddleware, signatureController.unsignDocument);

router.post('/verify-public', upload.single('file'), signatureController.verifyPublicDocument);

module.exports = router;