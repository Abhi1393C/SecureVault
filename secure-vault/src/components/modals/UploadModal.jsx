import React, { useState } from 'react';
import { UploadCloud, FileText, X, Unlock, Lock, Key, Folder, AlertCircle } from 'lucide-react';
import { Modal, Button } from '../SharedUI'; 
import api from '../../api/axiosConfig'; 
import { encryptFileInBrowser } from '../../utils/frontendCrypto'; 
import { useToast } from '../ToastContext';

// ─── Recursive helper: read all entries from a DataTransferItem ───────────────
const readEntry = (entry) =>
  new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((file) => resolve([{ file, relativePath: entry.fullPath }]), () => resolve([]));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readAll = (acc) => {
        reader.readEntries(async (entries) => {
          if (entries.length === 0) {
            const nested = await Promise.all(acc.map(readEntry));
            resolve(nested.flat());
          } else {
            readAll([...acc, ...entries]);
          }
        }, () => resolve([]));
      };
      readAll([]);
    } else {
      resolve([]);
    }
  });

const UploadModal = ({ isOpen, onClose, onUpload, currentFolder }) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  // For folder drag-and-drop: list of { file, relativePath }
  const [folderItems, setFolderItems] = useState(null); // null = single file mode
  const [mode, setMode] = useState('standard'); 
  const [pin, setPin] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  
  const { addToast } = useToast();

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    // Check if any item is a directory
    const entries = [];
    let hasDirectory = false;
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry?.();
      if (entry) {
        if (entry.isDirectory) hasDirectory = true;
        entries.push(entry);
      }
    }

    if (hasDirectory || entries.length > 1) {
      // Folder / multi-file drop: resolve recursively
      setUploadProgress('Scanning folder structure...');
      const allItems = (await Promise.all(entries.map(readEntry))).flat();
      setFolderItems(allItems);
      setSelectedFile(null);
      setUploadProgress('');
    } else if (entries.length === 1 && entries[0].isFile) {
      // Single file drop
      entries[0].file((file) => {
        setSelectedFile(file);
        setFolderItems(null);
      });
    } else if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setFolderItems(null);
    }
  };

  // ─── Single-file upload ───────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('mode', mode);
      if (currentFolder) formData.append('parentId', currentFolder.id);

      if (mode === 'encrypted') {
        try {
          await api.post('/auth/verify-pin', { pin });
        } catch {
          addToast('Incorrect Master PIN!', 'error');
          setUploading(false);
          return;
        }
        const arrayBuffer = await selectedFile.arrayBuffer();
        const encryptedData = await encryptFileInBrowser(arrayBuffer, pin);
        formData.append('ownerWrappedKey', encryptedData.ownerWrappedKey);
        const encryptedBlob = new Blob([encryptedData.fileData], {
          type: selectedFile.type || 'application/octet-stream'
        });
        formData.append('file', encryptedBlob, selectedFile.name);
      } else {
        formData.append('file', selectedFile);
      }

      const response = await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': undefined }
      });

      const currentUser = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || '{}');
      onUpload({
        id: response.data.documentId,
        name: selectedFile.name,
        owner: currentUser?.name || 'me',
        date: new Date().toISOString().split('T')[0],
        encrypted: mode === 'encrypted',
        signed: false,
        role: 'Owner',
        size: (selectedFile.size / (1024 * 1024)).toFixed(2) + ' MB',
        type: 'file',
        parentId: currentFolder ? currentFolder.id : null
      });

      setSelectedFile(null);
      setPin('');
      setMode('standard');
      addToast('Document securely uploaded!', 'success');
      onClose();
    } catch (error) {
      console.error('Upload failed:', error);
      addToast(error.response?.data?.error || 'Failed to upload document.', 'error');
    } finally {
      setUploading(false);
    }
  };

  // ─── Folder upload orchestration ─────────────────────────────────────────
  const handleFolderUpload = async () => {
    if (!folderItems || folderItems.length === 0) return;
    setUploading(true);

    try {
      if (mode === 'encrypted') {
        try {
          await api.post('/auth/verify-pin', { pin });
        } catch {
          addToast('Incorrect Master PIN!', 'error');
          setUploading(false);
          return;
        }
      }

      // Build unique folder paths sorted by depth (shallowest first)
      const folderPathSet = new Set();
      for (const item of folderItems) {
        // relativePath like "/rootFolder/subFolder/file.txt"
        const parts = item.relativePath.split('/').filter(Boolean);
        // collect all ancestor folder paths
        for (let i = 1; i < parts.length; i++) {
          folderPathSet.add('/' + parts.slice(0, i).join('/'));
        }
      }
      const sortedFolderPaths = [...folderPathSet].sort(
        (a, b) => a.split('/').length - b.split('/').length
      );

      // Map: relativeFolderPath -> MongoDB _id
      const folderIdMap = {};
      // Root level parent
      const rootParentId = currentFolder?.id || null;

      setUploadProgress(`Creating folder structure (0/${sortedFolderPaths.length})...`);

      for (let i = 0; i < sortedFolderPaths.length; i++) {
        const folderPath = sortedFolderPaths[i];
        const parts = folderPath.split('/').filter(Boolean);
        const folderName = parts[parts.length - 1];
        const parentPath = '/' + parts.slice(0, -1).join('/');
        const parentId = parts.length === 1 ? rootParentId : (folderIdMap[parentPath] || rootParentId);

        const res = await api.post('/documents/create-folder', {
          folderName,
          parentId
        });
        folderIdMap[folderPath] = res.data.folder._id;
        setUploadProgress(`Creating folders (${i + 1}/${sortedFolderPaths.length})...`);
      }

      // Upload each file into its correct folder
      setUploadProgress(`Uploading files (0/${folderItems.length})...`);
      for (let i = 0; i < folderItems.length; i++) {
        const { file, relativePath } = folderItems[i];
        const parts = relativePath.split('/').filter(Boolean);
        const parentFolderPath = parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : null;
        const fileParentId = parentFolderPath ? (folderIdMap[parentFolderPath] || rootParentId) : rootParentId;

        const formData = new FormData();
        formData.append('mode', mode);
        if (fileParentId) formData.append('parentId', fileParentId);

        if (mode === 'encrypted') {
          const arrayBuffer = await file.arrayBuffer();
          const encryptedData = await encryptFileInBrowser(arrayBuffer, pin);
          formData.append('ownerWrappedKey', encryptedData.ownerWrappedKey);
          const encryptedBlob = new Blob([encryptedData.fileData], {
            type: file.type || 'application/octet-stream'
          });
          formData.append('file', encryptedBlob, file.name);
        } else {
          formData.append('file', file);
        }

        try {
          await api.post('/documents/upload', formData, { headers: { 'Content-Type': undefined } });
        } catch (err) {
          console.error(`Failed to upload ${file.name}:`, err);
        }

        setUploadProgress(`Uploading files (${i + 1}/${folderItems.length})...`);
      }

      addToast(`Folder uploaded: ${folderItems.length} files processed.`, 'success');
      setFolderItems(null);
      setPin('');
      setMode('standard');
      onClose();
      // Trigger a full refresh by calling onUpload with null sentinel
      onUpload(null);
    } catch (error) {
      console.error('Folder upload failed:', error);
      addToast(error.response?.data?.error || 'Folder upload failed.', 'error');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  const handleClose = () => {
    if (uploading) return;
    setSelectedFile(null);
    setFolderItems(null);
    setPin('');
    setMode('standard');
    setUploadProgress('');
    onClose();
  };

  const isFolderMode = !!folderItems;
  const totalFiles = folderItems?.length || 0;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Upload Document" maxWidth="max-w-2xl">
      {!selectedFile && !folderItems ? (
        <div 
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${dragActive ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-700 bg-slate-900/50 hover:bg-slate-800'}`}
          onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
        >
          <UploadCloud className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <p className="text-slate-300 mb-2 font-medium">Drag & drop files or folders here</p>
          <p className="text-slate-500 text-sm mb-4">Supports PDF, DOCX, JPG and entire folders (Max 50MB per file)</p>
          <div className="flex items-center justify-center gap-3">
            <div className="relative">
              <input type="file" onChange={(e) => { if (e.target.files?.[0]) { setSelectedFile(e.target.files[0]); setFolderItems(null); } }} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <Button variant="outline">Browse Files</Button>
            </div>
            <div className="relative">
              <input
                type="file"
                // @ts-ignore
                webkitdirectory="true"
                multiple
                onChange={async (e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    const items = Array.from(e.target.files).map((file) => ({
                      file,
                      relativePath: '/' + (file.webkitRelativePath || file.name)
                    }));
                    setFolderItems(items);
                    setSelectedFile(null);
                  }
                }}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Button variant="outline" icon={Folder}>Browse Folder</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* File / Folder preview */}
          <div className="flex items-center p-4 bg-slate-800 border border-slate-700 rounded-lg">
            {isFolderMode ? (
              <Folder className="w-8 h-8 text-amber-400 mr-4 flex-shrink-0" />
            ) : (
              <FileText className="w-8 h-8 text-emerald-500 mr-4 flex-shrink-0" />
            )}
            <div className="flex-1 truncate">
              <p className="text-sm font-semibold text-slate-100 truncate">
                {isFolderMode
                  ? `Folder with ${totalFiles} file${totalFiles !== 1 ? 's' : ''}`
                  : selectedFile?.name}
              </p>
              <p className="text-xs text-slate-400">
                {isFolderMode ? 'Ready to upload recursively' : 'Ready to secure'}
              </p>
            </div>
            <button onClick={() => { setSelectedFile(null); setFolderItems(null); }} className="text-slate-500 hover:text-red-400">
              <X className="w-5 h-5"/>
            </button>
          </div>

          {/* Storage mode selector */}
          <div>
            <h4 className="text-sm font-medium text-slate-300 mb-3">Select Storage Mode</h4>
            <div className="grid grid-cols-2 gap-4">
              <div 
                onClick={() => setMode('standard')}
                className={`p-4 border rounded-xl cursor-pointer transition-all ${mode === 'standard' ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500' : 'border-slate-700 hover:border-slate-600'}`}
              >
                <Unlock className={`w-6 h-6 mb-2 ${mode === 'standard' ? 'text-emerald-400' : 'text-slate-500'}`} />
                <h5 className="font-medium text-slate-100 text-sm mb-1">Standard Storage</h5>
                <p className="text-xs text-slate-400">Accessible via your account login. Best for general documents.</p>
              </div>
              <div 
                onClick={() => setMode('encrypted')}
                className={`p-4 border rounded-xl cursor-pointer transition-all ${mode === 'encrypted' ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500' : 'border-slate-700 hover:border-slate-600'}`}
              >
                <Lock className={`w-6 h-6 mb-2 ${mode === 'encrypted' ? 'text-indigo-400' : 'text-slate-500'}`} />
                <h5 className="font-medium text-slate-100 text-sm mb-1">Encrypted Vault</h5>
                <p className="text-xs text-slate-400">AES-256-GCM. Requires account PIN to view or modify.</p>
              </div>
            </div>
          </div>

          {mode === 'encrypted' && (
            <div className="bg-indigo-500/10 p-4 rounded-lg border border-indigo-500/30 flex items-center space-x-4">
              <Key className="w-5 h-5 text-indigo-400 flex-shrink-0" />
              <input 
                type="password" 
                placeholder="Enter 6-digit PIN to encrypt" 
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="flex-1 bg-slate-950 text-white border border-indigo-500/50 rounded px-3 py-2 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {uploading && uploadProgress && (
            <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 animate-pulse" />
              {uploadProgress}
            </div>
          )}

          <div className="pt-4 flex justify-end space-x-3 border-t border-slate-800">
            <Button variant="ghost" onClick={handleClose} disabled={uploading}>Cancel</Button>
            <Button 
              variant="primary" 
              onClick={isFolderMode ? handleFolderUpload : handleUpload} 
              disabled={uploading || (mode === 'encrypted' && pin.length < 6)}
              className={mode === 'encrypted' ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : ''}
            >
              {uploading
                ? (isFolderMode ? 'Uploading Folder...' : 'Encrypting & Uploading...')
                : (isFolderMode ? `Upload Folder (${totalFiles} files)` : 'Secure & Upload')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default UploadModal;