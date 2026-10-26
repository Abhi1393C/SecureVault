const { Document, AuditLog } = require('../models/schema');

/**
 * GET /api/audit/
 * Fetch ALL audit logs related to the logged-in user's documents
 */
const getAllAuditLogs = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { lastTimestamp } = req.query; // Cursor parameter
        const PAGE_SIZE = 50;

        // 1. Find all documents owned by or shared with the user
        const userDocs = await Document.find({
            $or: [
                { ownerId: userId },
                { 'sharedWith.userId': userId }
            ]
        }).select('_id');

        const docIds = userDocs.map(doc => doc._id);

        // 2. Build base query filter
        const baseFilter = {
            $or: [
                { documentId: { $in: docIds } },
                { performedBy: userId }
            ]
        };

        // If lastTimestamp is provided, fetch records older than that timestamp
        if (lastTimestamp) {
            baseFilter.timestamp = { $lt: new Date(lastTimestamp) };
        }

        // Fetch PAGE_SIZE + 1 to determine if more records exist
        const logs = await AuditLog.find(baseFilter)
            .populate('performedBy', 'name email')
            .populate('documentId', 'fileName')
            .sort({ timestamp: -1 })
            .limit(PAGE_SIZE + 1);

        const hasMore = logs.length > PAGE_SIZE;
        const results = hasMore ? logs.slice(0, PAGE_SIZE) : logs;

        const nextCursor = hasMore
            ? results[results.length - 1].timestamp?.toISOString()
            : null;

        res.status(200).json({ logs: results, nextCursor, hasMore });
    } catch (error) {
        console.error("All Audit Logs Error:", error);
        res.status(500).json({ error: "Failed to fetch audit logs." });
    }
};

/**
 * GET /api/audit/:documentId
 * Fetch complete audit history for a specific document
 */
const getDocumentAuditTrail = async (req, res) => {
    try {
        const { documentId } = req.params;
        const userId = req.user.userId; // JWT middleware se aayega

        // 1. Fetch Document to check Access Control
        const doc = await Document.findById(documentId);
        if (!doc) {
            return res.status(404).json({ error: "Document not found." });
        }

        // 2. Security Check: Kya user Owner ya Shared User hai?
        const isOwner = doc.ownerId.toString() === userId.toString();
        const hasSharedAccess = doc.sharedWith.some(s => s.userId.toString() === userId.toString());

        if (!isOwner && !hasSharedAccess) {
            return res.status(403).json({ error: "Access Denied. You cannot view this document's history." });
        }

        // 3. Fetch Audit Logs and populate user details
        const logs = await AuditLog.find({ documentId: doc._id })
            .populate('performedBy', 'name email') // User ka naam aur email sath layega
            .sort({ timestamp: -1 }); // Latest sabse upar (Descending order)

        // 4. Send response
        res.status(200).json({
            success: true,
            documentName: doc.fileName,
            totalLogs: logs.length,
            trail: logs.map(log => ({
                action: log.action,
                performedBy: log.performedBy.name,
                email: log.performedBy.email,
                timestamp: log.timestamp,
                prevHash: log.prevHash,
                currentHash: log.currentHash
            }))
        });

    } catch (error) {
        console.error("Audit Trail Error:", error);
        res.status(500).json({ error: "Failed to fetch audit trail." });
    }
};

module.exports = {
    getAllAuditLogs,
    getDocumentAuditTrail
};