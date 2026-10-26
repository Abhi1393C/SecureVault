import React, { useState, useEffect, useCallback } from 'react';
import { 
  File, Lock, FileText, MoreVertical, PenTool, LayoutGrid, 
  List, Folder, FileSpreadsheet, Image as ImageIcon, Film, 
  Filter, ArrowUpDown, FolderInput, Download, Trash2, Info, Share2, ChevronLeft, Key,
  Music, Archive, FileCode, CheckSquare, X as XIcon
} from 'lucide-react';
import { Badge, Modal, Button } from '../SharedUI';
import { useToast } from '../ToastContext';
import api from '../../api/axiosConfig';

// 🚀 ENHANCED GET FILE ICON
const getFileIcon = (filename, isEncrypted, layout) => {
  const ext = filename?.split('.').pop().toLowerCase();
  let IconComp = File;
  let colorClass = "text-slate-400";

  if (['xlsx', 'xls', 'csv'].includes(ext)) { IconComp = FileSpreadsheet; colorClass = "text-emerald-400"; }
  else if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'svg'].includes(ext)) { IconComp = ImageIcon; colorClass = "text-blue-400"; }
  else if (['pdf', 'doc', 'docx', 'txt', 'rtf'].includes(ext)) { IconComp = FileText; colorClass = "text-red-400"; }
  else if (['mp4', 'webm', 'ogg', 'mov', 'avi', 'flv', 'wmv', '3gpp'].includes(ext)) { IconComp = Film; colorClass = "text-purple-400"; }
  else if (['mp3', 'wav', 'm4a', 'opus'].includes(ext)) { IconComp = Music; colorClass = "text-pink-400"; }
  else if (['zip', 'rar', 'tar', 'gzip'].includes(ext)) { IconComp = Archive; colorClass = "text-yellow-400"; }
  else if (['html', 'css', 'js', 'json', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'php'].includes(ext)) { IconComp = FileCode; colorClass = "text-cyan-400"; }

  const iconSize = layout === 'grid' ? 'w-6 h-6' : 'w-5 h-5';
  const lockSize = layout === 'grid' ? 'w-3 h-3' : 'w-2.5 h-2.5';
  
  const containerClass = layout === 'grid' 
    ? "relative p-2 rounded-lg bg-slate-800 flex items-center justify-center"
    : "relative mr-3 flex items-center justify-center";

  return (
    <div className={containerClass}>
      <IconComp className={`${iconSize} ${colorClass}`} />
      {isEncrypted && (
        <div className={`absolute ${layout === 'grid' ? '-top-2 -left-2' : '-top-1.5 -left-1.5'} bg-slate-900 border border-slate-700 rounded-full p-[2px] shadow-sm`}>
          <Lock className={`${lockSize} text-indigo-400`} />
        </div>
      )}
    </div>
  );
};

const DocumentList = ({ docs, title, currentFolder, onNavigateBack, onViewDoc, onShareDoc, onMoveDoc, onMoveToBin, isGlobalView = false, viewType = 'standard', getFolderName, searchQuery = '' }) => {
  const [layout, setLayout] = useState('grid'); 
  const [sortBy, setSortBy] = useState('date_desc');
  const [filterType, setFilterType] = useState('all');
  const [activeMenu, setActiveMenu] = useState(null); 
  const { addToast } = useToast();

  const [downloadPinModal, setDownloadPinModal] = useState({ isOpen: false, doc: null, pin: '' });
  const [isDownloading, setIsDownloading] = useState(false);
  const [renameModal, setRenameModal] = useState({ isOpen: false, doc: null, newName: '' });
  const [infoModal, setInfoModal] = useState({ isOpen: false, data: null, isLoading: false });

  // ─── Feature 3: Multi-select state ────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState([]);
  const [isBulkLoading, setIsBulkLoading] = useState(false);

  const toggleSelect = useCallback((e, id) => {
    e.stopPropagation();
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }, []);

  const clearSelection = () => setSelectedIds([]);

  // ─── Feature 2: Delete key → move selected to bin ─────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger when user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (e.key === 'Delete' && selectedIds.length > 0) {
        handleBulkBin();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Feature 3: Bulk actions ──────────────────────────────────────────────
  const handleBulkBin = async () => {
    if (selectedIds.length === 0) return;
    setIsBulkLoading(true);
    try {
      await Promise.all(selectedIds.map(id => api.patch(`/vault/${id}/bin`)));
      addToast(`${selectedIds.length} item(s) moved to bin.`, 'success');
      setSelectedIds([]);
      onMoveToBin && onMoveToBin(null);
    } catch (err) {
      addToast('Failed to move some items to bin.', 'error');
    } finally {
      setIsBulkLoading(false);
    }
  };

  const handleBulkShare = () => {
    if (selectedIds.length === 0) return;
    const firstDoc = docs.find(d => selectedIds.includes(d.id));
    if (firstDoc && onShareDoc) onShareDoc(firstDoc);
  };

  const handleBulkMove = () => {
    if (selectedIds.length === 0) return;
    const firstDoc = docs.find(d => selectedIds.includes(d.id));
    if (firstDoc && onMoveDoc) onMoveDoc(firstDoc);
  };

  // --- SAFE TIME GROUPING LOGIC ---
  const getTimeGroup = (dateString) => {
    if (!dateString) return 'Older';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Older'; 

    const today = new Date();
    const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const diffDays = (todayDay - dateDay) / (1000 * 60 * 60 * 24);
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return 'Previous 7 Days';
    return 'Older';
  };

  const formatAccessTime = (dateString) => {
    if (!dateString) return 'Opened by me';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Opened by me';

    const today = new Date();
    const isToday = date.getDate() === today.getDate() && 
                    date.getMonth() === today.getMonth() &&
                    date.getFullYear() === today.getFullYear();

    if (isToday) {
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${timeStr} • Opened by me`;
    } else {
      const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return `${dateStr} • Opened by me`;
    }
  };

  // 1. FILTER LOGIC
  let processedDocs = docs.filter(doc => {
    // 🚀 Search Query matching
    if (searchQuery && searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = (doc.name || '').toLowerCase().includes(q);
      const matchOwner = (doc.owner || '').toLowerCase().includes(q);
      const matchDate = (doc.date || '').toLowerCase().includes(q);
      const matchType = (doc.type || '').toLowerCase().includes(q);
      if (!matchName && !matchOwner && !matchDate && !matchType) return false;
    } else if (!isGlobalView) {
      const currentFolderId = currentFolder ? currentFolder.id : null;
      if (doc.parentId !== currentFolderId) return false;
    }
    
    if (filterType === 'all') return true;
    if (filterType === 'folder') return doc.type === 'folder';
    if (filterType === 'encrypted') return doc.encrypted;
    if (filterType === 'unencrypted') return !doc.encrypted && doc.type !== 'folder';
    if (filterType === 'signed') return doc.signed;
    
    const ext = doc.name?.split('.').pop().toLowerCase();
    if (filterType === 'pdf') return ext === 'pdf';
    if (filterType === 'image') return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'svg'].includes(ext);
    if (filterType === 'video') return ['mp4', 'webm', 'ogg', 'mov', 'avi', 'flv', 'wmv', '3gpp'].includes(ext);
    if (filterType === 'excel') return ['xlsx', 'xls', 'csv'].includes(ext);
    
    return true;
  });

  // 2. SORT LOGIC
  processedDocs.sort((a, b) => {
    if (viewType === 'recent') {
      const timeA = new Date(a.lastAccessed || a.date).getTime() || 0;
      const timeB = new Date(b.lastAccessed || b.date).getTime() || 0;
      if (timeB !== timeA) return timeB - timeA;
      return (a.name || '').localeCompare(b.name || '');
    }
    
    if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'name_desc') return (b.name || '').localeCompare(a.name || '');
    if (sortBy === 'size_asc') return parseFloat(a.size || 0) - parseFloat(b.size || 0); 
    if (sortBy === 'size_desc') return parseFloat(b.size || 0) - parseFloat(a.size || 0);
    if (sortBy === 'date_asc') return new Date(a.date).getTime() - new Date(b.date).getTime();
    if (sortBy === 'date_desc') return new Date(b.date).getTime() - new Date(a.date).getTime();
    return 0;
  });

  const folders = processedDocs.filter(doc => doc.type === 'folder');
  const files = processedDocs.filter(doc => doc.type !== 'folder');

  // --- RECENT GROUPS PREPARATION ---
  const recentGroups = { 'Today': [], 'Yesterday': [], 'Previous 7 Days': [], 'Older': [] };
  if (viewType === 'recent') {
    files.forEach(file => {
      const group = getTimeGroup(file.lastAccessed || file.date);
      recentGroups[group].push(file);
    });
  }

  const toggleMenu = (e, id) => {
    e.stopPropagation();
    setActiveMenu(activeMenu === id ? null : id);
  };

  const handleView = (doc) => {
    setActiveMenu(null);
    onViewDoc(doc);
  };

  const initiateDownload = (doc) => {
    setActiveMenu(null);
    if (doc.encrypted) {
      setDownloadPinModal({ isOpen: true, doc, pin: '' });
    } else {
      executeDownload(doc, null);
    }
  };

  const executeDownload = async (doc, pin) => {
    setIsDownloading(true);
    try {
      let blob;

      if (doc.encrypted) {
        if (!pin) throw new Error('PIN is required for encrypted files.');
        
        const { unwrapUserKey, decryptFileInBrowser } = await import('../../utils/frontendCrypto');
        
        const response = await api.post(`/vault/${doc.id}/download`);
        const data = response.data;

        const unlockedAesKey = await unwrapUserKey(data.ownerWrappedKey, pin); 
        const decryptedBuffer = await decryptFileInBrowser(data.fileData, unlockedAesKey);
        
        blob = new Blob([decryptedBuffer], { type: 'application/octet-stream' });
      } else {
        const response = await api.post(`/vault/${doc.id}/download`, { responseType: 'blob' });
        blob = response.data;
      }

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', doc.name);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      setDownloadPinModal({ isOpen: false, doc: null, pin: '' });
      addToast(`Successfully downloaded ${doc.name}`, 'success');

    } catch (error) {
      console.error('Download Error:', error);
      addToast('Download Failed: Incorrect PIN or Corrupted File.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleConfirmRename = async () => {
    if (!renameModal.newName.trim()) {
      addToast('File name cannot be empty.', 'error');
      return;
    }
    try {
      await api.patch(`/vault/${renameModal.doc.id}/rename`, { newName: renameModal.newName });
      addToast('Document renamed successfully!', 'success');
      setRenameModal({ isOpen: false, doc: null, newName: '' });
      window.location.reload(); 
    } catch (error) {
      addToast(error.response?.data?.error || 'Failed to rename document.', 'error');
    }
  };

  const handleOpenInfo = async (doc) => {
    setActiveMenu(null);
    setInfoModal({ isOpen: true, data: null, isLoading: true });
    try {
      const response = await api.get(`/vault/${doc.id}/info`);
      setInfoModal({ isOpen: true, data: response.data, isLoading: false });
    } catch (error) {
      addToast('Failed to fetch document information.', 'error');
      setInfoModal({ isOpen: false, data: null, isLoading: false });
    }
  };

  const DropdownMenu = ({ doc, positionClasses }) => (
    <div className={`absolute ${positionClasses} bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 py-1 min-w-[220px] text-left`}>
      <button onClick={(e) => { e.stopPropagation(); setActiveMenu(null); onViewDoc(doc); }} className="w-full px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center">
        <FileText className="w-4 h-4 mr-3 text-slate-400" /> Open
      </button>
      {doc.type !== 'folder' && (
        <button onClick={(e) => { e.stopPropagation(); initiateDownload(doc); }} className="w-full px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center">
          <Download className="w-4 h-4 mr-3 text-slate-400" /> Download
        </button>
      )}
      <button onClick={(e) => { e.stopPropagation(); setActiveMenu(null); setRenameModal({ isOpen: true, doc, newName: doc.name }); }} className="w-full px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center">
        <PenTool className="w-4 h-4 mr-3 text-slate-400" /> Rename
      </button>
      <div className="border-t border-slate-700 my-1"></div>
      <button onClick={(e) => { e.stopPropagation(); setActiveMenu(null); onShareDoc && onShareDoc(doc); }} className="w-full px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center">
        <Share2 className="w-4 h-4 mr-3 text-slate-400" /> Share
      </button>
      <button onClick={(e) => { e.stopPropagation(); setActiveMenu(null); onMoveDoc && onMoveDoc(doc); }} className="w-full px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center">
        <FolderInput className="w-4 h-4 mr-3 text-slate-400" /> Move to folder
      </button> 
      {doc.type !== 'folder' && (
        <button onClick={(e) => { e.stopPropagation(); handleOpenInfo(doc); }} className="w-full px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 flex items-center">
          <Info className="w-4 h-4 mr-3 text-slate-400" /> File information
        </button>
      )}
      <div className="border-t border-slate-700 my-1"></div>
      <button onClick={(e) => { e.stopPropagation(); setActiveMenu(null); onMoveToBin && onMoveToBin(doc.id); }} className="w-full px-4 py-2 text-sm text-red-400 hover:bg-slate-700 flex items-center">
        <Trash2 className="w-4 h-4 mr-3" /> Move to bin
      </button>
    </div>
  );

  return (
    <div onClick={() => setActiveMenu(null)}>
      
      {/* HEADER WITH FILTERS & TOGGLES */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 space-y-4 sm:space-y-0">
        <div className="flex items-center">
          {currentFolder && (
            <button onClick={onNavigateBack} className="mr-3 p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors" title="Go back">
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
          <h2 className="text-2xl font-bold text-slate-100">{title}</h2>
        </div>
        
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {/* Filters & Toggles */}
          <div className="relative flex items-center bg-slate-900 border border-slate-700 rounded-lg px-2 shadow-sm">
            <Filter className="w-4 h-4 text-slate-400 mr-2" />
            <select 
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value)}
              className="bg-slate-900 text-sm text-slate-200 py-1.5 focus:outline-none cursor-pointer outline-none border-none"
            >
              <option value="all" className="bg-slate-900 text-slate-200">All Files</option>
              <option value="folder" className="bg-slate-900 text-slate-200">Folders Only</option>
              <option value="pdf" className="bg-slate-900 text-slate-200">PDFs</option>
              <option value="excel" className="bg-slate-900 text-slate-200">Spreadsheets</option>
              <option value="image" className="bg-slate-900 text-slate-200">Images</option>
              <option value="video" className="bg-slate-900 text-slate-200">Videos</option>
              <option value="encrypted" className="bg-slate-900 text-slate-200">Encrypted (Vault)</option>
              <option value="unencrypted" className="bg-slate-900 text-slate-200">Standard</option>
            </select>
          </div>

          <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-1 space-x-1 ml-auto sm:ml-0 shadow-sm">
            <button onClick={() => setLayout('list')} className={`p-1.5 rounded-md transition-colors ${layout === 'list' ? 'bg-slate-700 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}><List className="w-4 h-4" /></button>
            <button onClick={() => setLayout('grid')} className={`p-1.5 rounded-md transition-colors ${layout === 'grid' ? 'bg-slate-700 text-emerald-400' : 'text-slate-500 hover:text-slate-300'}`}><LayoutGrid className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* ─── Feature 3: Sticky Bulk Action Toolbar ───────────────────────────── */}
      {selectedIds.length > 0 && (
        <div className="sticky top-0 z-40 mb-4 flex items-center gap-3 bg-slate-900/95 backdrop-blur border border-emerald-500/30 rounded-xl px-4 py-3 shadow-xl shadow-emerald-950/30">
          <CheckSquare className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span className="text-sm font-medium text-slate-200 flex-1">
            {selectedIds.length} item{selectedIds.length !== 1 ? 's' : ''} selected
          </span>
          <Button variant="outline" icon={Share2} onClick={handleBulkShare} disabled={isBulkLoading} className="text-xs py-1.5">
            Share
          </Button>
          <Button variant="outline" icon={FolderInput} onClick={handleBulkMove} disabled={isBulkLoading} className="text-xs py-1.5">
            Move
          </Button>
          <Button variant="danger" icon={Trash2} onClick={handleBulkBin} disabled={isBulkLoading} className="text-xs py-1.5">
            {isBulkLoading ? 'Moving...' : 'Move to Bin'}
          </Button>
          <button onClick={clearSelection} className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors" title="Clear selection">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ============================== */}
      {/*         GRID LAYOUT            */}
      {/* ============================== */}
      {layout === 'grid' && (
        <div className="space-y-6">
          {/* FOLDERS GRID */}
          {folders.length > 0 && viewType !== 'recent' && (
            <div>
              <p className="text-sm font-medium text-slate-500 mb-3 uppercase tracking-wider">Folders</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {folders.map(folder => {
                  const isSelected = selectedIds.includes(folder.id);
                  return (
                    <div key={folder.id} className="relative group">
                      {/* Hover-to-reveal checkbox */}
                      <div
                        className={`absolute top-2 left-2 z-10 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        onClick={(e) => toggleSelect(e, folder.id)}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-900/80 border-slate-500 hover:border-emerald-400'}`}>
                          {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                        </div>
                      </div>
                      <div
                        onClick={() => handleView(folder)}
                        className={`flex items-center p-4 bg-slate-900 rounded-xl border shadow-sm hover:border-emerald-500/50 cursor-pointer transition-all ${isSelected ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800'}`}
                      >
                        <Folder className="w-6 h-6 text-slate-500 mr-3 group-hover:text-emerald-400 transition-colors" />
                        <span className="font-medium text-slate-200 truncate flex-1">{folder.name}</span>
                        <button className="p-1" onClick={(e) => toggleMenu(e, folder.id)}><MoreVertical className="w-4 h-4 text-slate-400 hover:text-white"/></button>
                      </div>
                      {activeMenu === folder.id && <DropdownMenu doc={folder} positionClasses="top-12 right-4" />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* FILES GRID */}
          {files.length > 0 && (
            <div>
              {viewType === 'recent' ? (
                Object.entries(recentGroups).map(([groupName, groupFiles]) => {
                  if (groupFiles.length === 0) return null;
                  return (
                    <div key={groupName} className="mb-8">
                      <p className="text-sm font-medium text-slate-100 mb-3">{groupName}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {groupFiles.map(doc => {
                          const isSelected = selectedIds.includes(doc.id);
                          return (
                            <div key={doc.id} className={`relative bg-slate-900 rounded-xl border shadow-md hover:border-emerald-500/50 cursor-pointer group flex flex-col transition-all ${isSelected ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800'}`}>
                              {/* Hover-to-reveal checkbox */}
                              <div
                                className={`absolute top-3 left-3 z-10 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                onClick={(e) => toggleSelect(e, doc.id)}
                              >
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-900/80 border-slate-500 hover:border-emerald-400'}`}>
                                  {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                </div>
                              </div>
                              <div className="p-5 flex-1" onClick={() => handleView(doc)}>
                                <div className="flex justify-between items-start mb-4">
                                  {getFileIcon(doc.name, doc.encrypted, 'grid')}
                                  <button className="p-1 text-slate-500 hover:text-slate-300" onClick={(e) => toggleMenu(e, doc.id)}><MoreVertical className="w-5 h-5" /></button>
                                </div>
                                <h3 className="font-semibold text-slate-100 truncate mb-1">{doc.name}</h3>
                                <p className="text-xs text-slate-400 mb-4">Opened • {doc.size}</p>
                                <div className="flex flex-wrap gap-2 mt-auto">
                                  {doc.encrypted && <Badge variant="secure"><Lock className="w-3 h-3 mr-1" /> Encrypted</Badge>}
                                  {doc.signed && doc.name.toLowerCase().endsWith('.pdf') && <Badge variant="success"><PenTool className="w-3 h-3 mr-1" /> Signed</Badge>}
                                </div>
                              </div>
                              {activeMenu === doc.id && <DropdownMenu doc={doc} positionClasses="top-12 right-4" />}
                              <div className={`h-1 w-full absolute top-0 left-0 ${doc.encrypted ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div>
                  {folders.length > 0 && <p className="text-sm font-medium text-slate-500 mb-3 uppercase tracking-wider">Files</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {files.map(doc => {
                      const isSelected = selectedIds.includes(doc.id);
                      return (
                        <div key={doc.id} className={`relative bg-slate-900 rounded-xl border shadow-md hover:border-emerald-500/50 cursor-pointer group flex flex-col transition-all ${isSelected ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800'}`}>
                          {/* Hover-to-reveal checkbox */}
                          <div
                            className={`absolute top-3 left-3 z-10 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                            onClick={(e) => toggleSelect(e, doc.id)}
                          >
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'bg-slate-900/80 border-slate-500 hover:border-emerald-400'}`}>
                              {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                          </div>
                          <div className="p-5 flex-1" onClick={() => handleView(doc)}>
                            <div className="flex justify-between items-start mb-4">
                              {getFileIcon(doc.name, doc.encrypted, 'grid')}
                              <button className="p-1 text-slate-500 hover:text-slate-300" onClick={(e) => toggleMenu(e, doc.id)}><MoreVertical className="w-5 h-5" /></button>
                            </div>
                            <h3 className="font-semibold text-slate-100 truncate mb-1">{doc.name}</h3>
                            <p className="text-xs text-slate-400 mb-4">{doc.date} • {doc.size}</p>
                            <div className="flex flex-wrap gap-2 mt-auto">
                              {doc.encrypted && <Badge variant="secure"><Lock className="w-3 h-3 mr-1" /> Encrypted</Badge>}
                              {doc.signed && doc.name.toLowerCase().endsWith('.pdf') && <Badge variant="success"><PenTool className="w-3 h-3 mr-1" /> Signed</Badge>}
                            </div>
                          </div>
                          {activeMenu === doc.id && <DropdownMenu doc={doc} positionClasses="top-12 right-4" />}
                          <div className={`h-1 w-full absolute top-0 left-0 ${doc.encrypted ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ============================== */}
      {/*         LIST LAYOUT            */}
      {/* ============================== */}
      {layout === 'list' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-visible shadow-sm">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400">
              <tr>
                <th className="px-4 py-3">
                  {/* Select-all checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedIds.length === processedDocs.length && processedDocs.length > 0}
                    onChange={() => {
                      if (selectedIds.length === processedDocs.length) {
                        setSelectedIds([]);
                      } else {
                        setSelectedIds(processedDocs.map(d => d.id));
                      }
                    }}
                    className="rounded bg-slate-900 border-slate-700 accent-emerald-500 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 font-medium">Name</th>
                {viewType === 'recent' && <th className="px-6 py-3 font-medium"></th>}
                <th className="px-6 py-3 font-medium">{viewType === 'recent' ? 'Owner' : 'Date modified'}</th>
                <th className="px-6 py-3 font-medium">File size</th>
                {viewType === 'recent' && <th className="px-6 py-3 font-medium">Location</th>}
                <th className="px-6 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-slate-300">
              {processedDocs.map(doc => {
                const safeOwner = doc.owner || 'Unknown';
                const isSelected = selectedIds.includes(doc.id);
                return (
                  <tr key={doc.id} className={`hover:bg-slate-800/50 transition-colors cursor-pointer relative group ${isSelected ? 'bg-emerald-500/5' : ''}`}>
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleSelect(e, doc.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded bg-slate-900 border-slate-700 accent-emerald-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-4 flex items-center" onClick={() => handleView(doc)}>
                      {doc.type === 'folder' ? <Folder className="w-5 h-5 text-slate-500 mr-3" /> : getFileIcon(doc.name, doc.encrypted, 'list')}
                      <span className="font-medium text-slate-200 truncate max-w-[200px] sm:max-w-xs">{doc.name}</span>
                    </td>
                    
                    {viewType === 'recent' && (
                      <td className="px-6 py-4 text-slate-400 text-xs font-medium" onClick={() => handleView(doc)}>
                        {formatAccessTime(doc.lastAccessed || doc.date)}
                      </td>
                    )}
                    
                    <td className="px-6 py-4 text-slate-400" onClick={() => handleView(doc)}>
                      {viewType === 'recent' ? (
                        <div className="flex items-center">
                          <div className="w-6 h-6 rounded-full bg-slate-700 text-[10px] font-bold flex items-center justify-center mr-2">
                            {safeOwner.substring(0,1).toUpperCase()}
                          </div>
                          {safeOwner}
                        </div>
                      ) : (
                        doc.date
                      )}
                    </td>
                    
                    <td className="px-6 py-4 text-slate-400" onClick={() => handleView(doc)}>{doc.type === 'folder' ? '—' : doc.size}</td>
                    
                    {viewType === 'recent' && (
                      <td className="px-6 py-4 text-slate-400" onClick={() => handleView(doc)}>
                         <div className="flex items-center text-xs">
                            <Folder className="w-4 h-4 mr-2" />
                            {getFolderName ? getFolderName(doc.parentId) : 'My Documents'}
                         </div>
                      </td>
                    )}

                    <td className="px-6 py-4 text-right relative">
                      <button className="p-1 text-slate-500 hover:text-slate-300" onClick={(e) => toggleMenu(e, doc.id)}>
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {activeMenu === doc.id && <DropdownMenu doc={doc} positionClasses="right-10 top-2" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* EMPTY STATE */}
      {processedDocs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-slate-900/30 border border-slate-800/80 rounded-2xl">
          <File className="w-12 h-12 text-slate-600 mb-3" />
          <p className="text-slate-300 font-semibold text-base mb-1">
            {searchQuery ? `No files or folders matching "${searchQuery}"` : "No documents found"}
          </p>
          <p className="text-slate-500 text-xs max-w-sm">
            {searchQuery 
              ? "Check your spelling or try searching with a different keyword." 
              : "This folder or view is currently empty. Use the Upload or New Folder button above to add documents."}
          </p>
        </div>
      )}
      
      {/* PIN Unlock Modal for List Downloads */}
      <Modal isOpen={downloadPinModal.isOpen} onClose={() => !isDownloading && setDownloadPinModal({ isOpen: false, doc: null, pin: '' })} title="Unlock Encrypted Document">
        <div className="space-y-4">
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded p-3 flex text-indigo-200/90 text-sm">
            <Lock className="w-5 h-5 mr-3 flex-shrink-0 text-indigo-400" />
            <p>"{downloadPinModal.doc?.name}" is protected by AES-256-GCM. Enter your Master PIN to decrypt and download.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Master PIN</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-indigo-400" />
              <input
                type="password"
                maxLength={6}
                value={downloadPinModal.pin}
                autoFocus
                onChange={(e) => setDownloadPinModal({ ...downloadPinModal, pin: e.target.value })}
                className="w-full pl-10 pr-3 py-2 bg-slate-950 border border-indigo-500/50 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="******"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" onClick={() => setDownloadPinModal({ isOpen: false, doc: null, pin: '' })} disabled={isDownloading}>Cancel</Button>
            <Button variant="primary" onClick={() => executeDownload(downloadPinModal.doc, downloadPinModal.pin)} disabled={downloadPinModal.pin.length < 6 || isDownloading} className="bg-indigo-600 hover:bg-indigo-500 text-white">
              {isDownloading ? 'Decrypting...' : 'Decrypt & Download'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* RENAME MODAL */}
      <Modal isOpen={renameModal.isOpen} onClose={() => setRenameModal({ isOpen: false, doc: null, newName: '' })} title={renameModal.doc?.type === 'folder' ? "Rename Folder" : "Rename Document"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">{renameModal.doc?.type === 'folder' ? "New Folder Name" : "New File Name"}</label>
            <input
              type="text"
              value={renameModal.newName}
              autoFocus
              onChange={(e) => setRenameModal({ ...renameModal, newName: e.target.value })}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" onClick={() => setRenameModal({ isOpen: false, doc: null, newName: '' })}>Cancel</Button>
            <Button variant="primary" onClick={handleConfirmRename}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* FILE INFORMATION MODAL */}
      <Modal isOpen={infoModal.isOpen} onClose={() => setInfoModal({ isOpen: false, data: null, isLoading: false })} title="File details">
        <div className="space-y-4 text-sm">
          {infoModal.isLoading ? (
            <div className="py-8 text-center text-slate-400">Loading metadata...</div>
          ) : infoModal.data ? (
            <div className="space-y-3 text-slate-300">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Type</span>
                <span className="font-medium text-white uppercase">{infoModal.data.type}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Storage Size</span>
                <span className="font-medium text-white">{infoModal.data.size}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Storage Mode</span>
                <span className="font-medium text-indigo-400">{infoModal.data.storageMode}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Owner</span>
                <span className="font-medium text-white">{infoModal.data.owner}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Created At</span>
                <span className="font-medium text-white">{new Date(infoModal.data.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Last Modified</span>
                <span className="font-medium text-white">{new Date(infoModal.data.updatedAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Integrity Status</span>
                <span className={`font-medium ${infoModal.data.signed ? 'text-emerald-400' : 'text-slate-400'}`}>
                  {infoModal.data.signed ? 'Signed & Verified' : 'Unsigned'}
                </span>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-red-400">Failed to load file details.</div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default DocumentList;