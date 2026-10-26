import React, { useState, useEffect, useCallback } from 'react';
import { Download, Calendar, Link as LinkIcon, Loader, Search, ChevronDown } from 'lucide-react';
import { Button, Badge } from '../components/SharedUI';
import api from '../api/axiosConfig';

const AuditLogPage = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  
  // Filtering states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState('All Actions');

  // ─── Initial & Paginated fetch ────────────────────────────────────────────
  const fetchAuditLogs = useCallback(async (cursor = null, append = false) => {
    try {
      if (!append) setLoading(true);
      else setLoadingMore(true);

      const params = cursor ? { lastTimestamp: cursor } : {};
      const response = await api.get('/audit', { params });

      const { logs: newLogs, nextCursor: newCursor, hasMore: more } = response.data;

      setLogs(prev => append ? [...prev, ...(newLogs || [])] : (newLogs || []));
      setNextCursor(newCursor);
      setHasMore(!!more);
    } catch (error) {
      console.error('Failed to fetch audit logs', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const handleLoadMore = () => {
    if (nextCursor && !loadingMore) {
      fetchAuditLogs(nextCursor, true);
    }
  };

  // 🚀 Advanced Filter Logic (Search Query + Action Filter combined)
  const filteredLogs = logs.filter((log) => {
    const term = searchQuery.toLowerCase();
    const docName = (log.documentName || log.documentId?.fileName || log.doc || '').toLowerCase();
    const userName = (log.performedBy?.name || 'You').toLowerCase();
    const action = (log.action || '').toLowerCase();
    const hash = (log.currentHash || log.hash || '').toLowerCase();

    // Text match check
    const matchesSearch = docName.includes(term) || userName.includes(term) || action.includes(term) || hash.includes(term);

    // Action dropdown check
    if (selectedAction !== 'All Actions') {
      const formattedFilterAction = selectedAction.toUpperCase();
      const matchesAction = action.includes(formattedFilterAction.toLowerCase()) || 
                            (selectedAction === 'Signed' && action.includes('sign')) ||
                            (selectedAction === 'Uploaded' && action.includes('upload')) ||
                            (selectedAction === 'Viewed' && action.includes('view')) ||
                            (selectedAction === 'Deleted' && (action.includes('delete') || action.includes('bin')));
      return matchesSearch && matchesAction;
    }

    return matchesSearch;
  });

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-100">Cryptographic Audit Log</h2>
        <p className="text-slate-400 mt-1">Tamper-evident history of all document interactions.</p>
      </div>

      <div className="bg-slate-900 rounded-xl shadow-sm border border-slate-800 overflow-hidden">
        {/* Controls Row */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/50 flex flex-wrap gap-4 items-center justify-between">
          
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {/* SEARCH BAR */}
            <div className="relative w-full max-w-xs">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search documents, users, or hashes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 border border-slate-700 rounded-lg text-sm bg-slate-950 text-slate-200 focus:ring-emerald-500 focus:border-emerald-500 placeholder-slate-600 transition-colors"
              />
            </div>

            {/* Action Filter Dropdown */}
            <select 
              value={selectedAction}
              onChange={(e) => setSelectedAction(e.target.value)}
              className="border border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-slate-950 text-slate-200 focus:ring-emerald-500 focus:border-emerald-500 outline-none cursor-pointer"
            >
              <option value="All Actions">All Actions</option>
              <option value="Signed">Signed</option>
              <option value="Uploaded">Uploaded</option>
              <option value="Viewed">Viewed</option>
              <option value="Deleted">Deleted</option>
            </select>

            {/* Time Filter Dropdown */}
            <select className="border border-slate-700 rounded-lg px-3 py-1.5 text-sm bg-slate-950 text-slate-200 focus:ring-emerald-500 focus:border-emerald-500 outline-none cursor-pointer">
              <option>All Time</option>
              <option>Last 7 Days</option>
            </select>
          </div>

          <Button variant="outline" icon={Download} className="py-1.5 whitespace-nowrap">Export CSV</Button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-3 font-medium">Timestamp</th>
                <th className="px-6 py-3 font-medium">User</th>
                <th className="px-6 py-3 font-medium">Action</th>
                <th className="px-6 py-3 font-medium">Document</th>
                <th className="px-6 py-3 font-medium text-right">Hash Chain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {loading ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-400">
                    <Loader className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" />
                    Fetching secure logs...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                    {searchQuery || selectedAction !== 'All Actions' 
                      ? `No logs found matching your filters.` 
                      : "No cryptographic logs found for your account yet."}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, idx) => (
                  <tr key={log._id || idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-slate-400">
                      <Calendar className="w-4 h-4 inline mr-2 opacity-50"/>
                      {new Date(log.createdAt || log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-200">
                      {log.performedBy?.name || 'You'}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={
                        log.action?.includes('DELETE') ? 'danger' :
                        log.action?.includes('SIGN') ? 'success' :
                        log.action?.includes('UPLOAD') ? 'secure' :
                        log.action?.includes('SHARE') ? 'warning' : 'default'
                      }>
                        {log.action?.replace(/_/g, ' ') || 'Action'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-slate-400 truncate max-w-[200px]" title={log.documentName || log.documentId?.fileName || log.doc || 'Unknown Document'}>
                      {log.documentName || log.documentId?.fileName || log.doc || 'Unknown Document'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center space-x-2 font-mono text-xs">
                        {log.prevHash && log.prevHash !== 'NULL' && (
                          <span className="text-slate-500" title={log.prevHash}>
                            {log.prevHash.substring(0, 8)}...
                          </span>
                        )}
                        {log.prevHash && log.prevHash !== 'NULL' && (
                          <LinkIcon className="w-3 h-3 text-emerald-500" />
                        )}
                        <span className="bg-slate-950 px-2 py-1 rounded text-slate-300 border border-slate-700" title={log.currentHash || log.hash}>
                          {(log.currentHash || log.hash) ? (log.currentHash || log.hash).substring(0, 8) + '...' : 'N/A'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ─── Feature 4: Load More button ──────────────────────────────── */}
        {!loading && hasMore && (
          <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-center">
            <Button
              variant="outline"
              icon={loadingMore ? Loader : ChevronDown}
              onClick={handleLoadMore}
              disabled={loadingMore}
              className={`text-sm ${loadingMore ? 'opacity-70' : ''}`}
            >
              {loadingMore ? 'Loading...' : 'Load More'}
            </Button>
          </div>
        )}

        {!loading && !hasMore && logs.length > 0 && (
          <div className="px-6 py-3 border-t border-slate-800 text-center text-xs text-slate-600">
            All {logs.length} log entries loaded
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogPage;