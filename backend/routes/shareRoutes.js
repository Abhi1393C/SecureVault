const express = require('express');
const router = express.Router();
const { shareInternal, createExternalLink, viewExternalDocument } = require('../controllers/shareController');
const verifyToken = require('../middlewares/authMiddleware');

// POST /api/share/internal
router.post('/internal', verifyToken, shareInternal);

// POST /api/share/external
router.post('/external', verifyToken, createExternalLink);

router.post('/view/:shareId', viewExternalDocument);

module.exports = router;