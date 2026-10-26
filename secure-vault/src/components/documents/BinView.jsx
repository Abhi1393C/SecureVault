import React, { useState } from 'react';
import { Trash2, RotateCcw, Folder, FileText } from 'lucide-react';
import { Button } from '../SharedUI';
import { useToast } from '../ToastContext';
import api from '../../api/axiosConfig';

export default function BinView({ docs, setBinDocs, onRestore, onPermanentDelete, onEmptyBin }) {
  const { addToast } = useToast();
  const [selectedIds, setSelectedIds] = useState([]);

  const toggleSelectAll = () => {
    if (selectedIds.length === docs.length) setSelectedIds([]);
    else setSelectedIds(docs.map(d => d.id));
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkDelete = async () => {
    try {
      await Promise.all(selectedIds.map(id => api.delete(`/vault/${id}/permanent`)));
      setBinDocs(docs.filter(d => !selectedIds.includes(d.id)));
      setSelectedIds([]);
      addToast("Selected items permanently deleted.", "success");
    } catch (error) {
      addToast("Failed to delete selected items.", "error");
    }
  };

  const handleBulkRestore = async () => {
    try {
      await Promise.all(selectedIds.map(id => api.patch(`/vault/${id}/restore`)));
      setBinDocs(docs.filter(d => !selectedIds.includes(d.id)));
      setSelectedIds([]);
      addToast("Selected items restored successfully.", "success");
    } catch (error) {
      addToast("Failed to restore selected items.", "error");
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Bin</h2>
          <p className="text-xs text-slate-400 mt-1">Items in the bin are automatically deleted after 7 days.</p>
        </div>
        <div className="flex space-x-3">
          {selectedIds.length > 0 && (
            <>
              <Button variant="outline" icon={RotateCcw} onClick={handleBulkRestore}>Restore Selected</Button>
              <Button variant="danger" icon={Trash2} onClick={handleBulkDelete}>Delete Selected</Button>
            </>
          )}
          {docs.length > 0 && (
            <Button variant="danger" icon={Trash2} onClick={onEmptyBin}>Empty Bin</Button>
          )}
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center">
          <Trash2 className="w-16 h-16 text-slate-600 mb-4" />
          <h3 className="text-lg font-medium text-slate-300">Your bin is empty</h3>
          <p className="text-sm text-slate-500 mt-1">Deleted files will appear here before being permanently removed.</p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-3 border-b border-slate-800 flex items-center bg-slate-950/40 text-xs font-semibold text-slate-400">
            <input type="checkbox" onChange={toggleSelectAll} checked={selectedIds.length === docs.length && docs.length > 0} className="mr-4 rounded bg-slate-900 border-slate-700" />
            <span className="flex-1">Name</span>
            <span className="w-32">Deleted Date</span>
            <span className="w-28 text-right">Actions</span>
          </div>
          <div className="divide-y divide-slate-800">
            {docs.map(doc => (
              <div key={doc.id} className="p-3 flex items-center hover:bg-slate-800/50 transition-colors text-sm">
                <input type="checkbox" checked={selectedIds.includes(doc.id)} onChange={() => toggleSelect(doc.id)} className="mr-4 rounded bg-slate-900 border-slate-700" />
                <div className="flex-1 flex items-center font-medium text-slate-200">
                  {doc.type === 'folder' ? (
                    <Folder className="w-4 h-4 text-amber-400 mr-2 flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
                  )}
                  <span className="truncate">{doc.name}</span>
                </div>
                <span className="w-32 text-xs text-slate-400">{new Date(doc.deletedAt || Date.now()).toLocaleDateString()}</span>
                <div className="w-28 flex justify-end space-x-2">
                  <button onClick={() => onRestore(doc.id)} title="Restore" className="p-1.5 hover:bg-slate-700 rounded text-slate-300 hover:text-emerald-400 transition-colors">
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button onClick={() => onPermanentDelete(doc.id)} title="Delete Forever" className="p-1.5 hover:bg-slate-700 rounded text-slate-300 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}