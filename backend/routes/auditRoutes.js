const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/authMiddleware');
const auditController = require('../controllers/auditController');

// GET /api/audit/
// Fetch ALL audit logs for the logged-in user (For the Audit Log Page)
router.get('/', verifyToken, auditController.getAllAuditLogs);

// GET /api/audit/:documentId
// Protected by verifyToken
router.get('/:documentId', verifyToken, auditController.getDocumentAuditTrail);

module.exports = router;