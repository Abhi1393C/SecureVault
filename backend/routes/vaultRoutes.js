const express = require('express');
const router = express.Router();
const vaultController = require('../controllers/vaultController');
const verifyToken = require('../middlewares/authMiddleware');

// Using POST instead of GET so we can safely pass the Master PIN in the request body
router.post('/:id/download', verifyToken, vaultController.downloadDocument);
router.patch('/:id/rename', verifyToken, vaultController.renameDocument);
router.get('/:id/info', verifyToken, vaultController.getDocumentInfo);
router.patch('/:id/bin', verifyToken, vaultController.moveToBin);
router.get('/bin/all', verifyToken, vaultController.getBinDocuments);
router.patch('/:id/restore', verifyToken, vaultController.restoreDocument);
router.delete('/:id/permanent', verifyToken, vaultController.permanentDeleteDocument);
router.delete('/bin/empty', verifyToken, vaultController.emptyBin);

module.exports = router;