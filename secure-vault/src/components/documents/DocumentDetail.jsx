import React, { useState, useEffect, useRef } from 'react';
import { 
  ChevronRight, Lock, FileText, PenTool, Share2, 
  Download, Users, ShieldCheck, CheckCircle, FileCheck,
  FileSpreadsheet, Image as ImageIcon, File, Key, Eye, Loader,
  Film, Music, Archive, FileCode, ShieldAlert 
} from 'lucide-react';
import { Button, Badge, Modal } from '../SharedUI';
import api from '../../api/axiosConfig';
import { useToast } from '../ToastContext';
import { decryptFileInBrowser, unwrapUserKey } from '../../utils/frontendCrypto'; 
import DocxViewer from './DocxViewer'; 

const getFileIcon = (filename, isEncrypted) => {
  if (isEncrypted) return <Lock className="w-5 h-5 mr-2 text-indigo-400" />;
  const ext = filename.split('.').pop().toLowerCase();
  
  if (['xlsx', 'xls', 'csv'].includes(ext)) return <FileSpreadsheet className="w-5 h-5 mr-2 text-emerald-400" />;
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'svg'].includes(ext)) return <ImageIcon className="w-5 h-5 mr-2 text-blue-400" />;
  if (['pdf', 'doc', 'docx', 'txt', 'rtf'].includes(ext)) return <FileText className="w-5 h-5 mr-2 text-red-400" />;
  if (['mp4', 'webm', 'ogg', 'mov', 'avi', 'flv', 'wmv', '3gpp'].includes(ext)) return <Film className="w-5 h-5 mr-2 text-purple-400" />;
  if (['mp3', 'wav', 'm4a', 'opus'].includes(ext)) return <Music className="w-5 h-5 mr-2 text-pink-400" />;
  if (['zip', 'rar', 'tar', 'gzip'].includes(ext)) return <Archive className="w-5 h-5 mr-2 text-yellow-400" />;
  if (['html', 'css', 'js', 'json', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'php'].includes(ext)) return <FileCode className="w-5 h-5 mr-2 text-cyan-400" />;
  return <File className="w-5 h-5 mr-2 text-slate-400" />; 
};

const getMimeType = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  const mimeTypes = {
    pdf: 'application/pdf',
    txt: 'text/plain', html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp',
    mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg',
    mp3: 'audio/mpeg', wav: 'audio/wav',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip'
  };
  return mimeTypes[ext] || 'application/octet-stream';
};

const DocumentDetail = ({ doc, onBack, onOpenSign, onOpenShare }) => {
  const { addToast } = useToast();
  const [fileBlobUrl, setFileBlobUrl] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pendingAction, setPendingAction] = useState(null); 
  
  // 🚀 NAYA STATE: Hamesha fresh signature status track karne ke liye
  const [localSigned, setLocalSigned] = useState(doc?.signed || false);
  const lastFetchedDocId = useRef(null);

  // Modal states ke paas add karo
  const [showUnsignModal, setShowUnsignModal] = useState(false);
  const [isUnsigning, setIsUnsigning] = useState(false);

  // Purane handleUnsign ko ISSE replace kar do (No more window.confirm!)
  const executeUnsign = async () => {
    setIsUnsigning(true);
    try {
      await api.post(`/documents/${doc.id}/unsign`); 
      setLocalSigned(false); 
      setShowUnsignModal(false); 

      // 🚀 FIX: Clear old signed preview blob and re-fetch the clean unsigned PDF from backend
      if (fileBlobUrl) {
        window.URL.revokeObjectURL(fileBlobUrl);
        setFileBlobUrl(null);
      }

      if (doc.encrypted) {
        setPendingAction('view');
        setShowPinModal(true); // Re-prompt PIN to view the clean decrypted file if encrypted
      } else {
        executeFileFetch('view', null); // Automatically reload clean preview for standard files
      }

      addToast("Signature removed successfully. Clean document restored.", "success");
    } catch (error) {
      console.error("Unsign error:", error);
      addToast(error.response?.data?.error || "Failed to remove signature.", "error");
    } finally {
      setIsUnsigning(false);
    }
  };

  // 🚀 NAYA LOGIC: Jab bhi document load ho, backend se fresh status fetch karo
  useEffect(() => {
    if (doc?.id) {
      setLocalSigned(doc.signed);
      const fetchFreshStatus = async () => {
        try {
          const res = await api.get(`/vault/${doc.id}/info`);
          if (res.data && res.data.signed !== undefined) {
            setLocalSigned(res.data.signed);
          }
        } catch (error) {
          console.error("Failed to fetch fresh doc status", error);
        }
      };
      fetchFreshStatus();
    }
  }, [doc]);

  useEffect(() => {
    return () => {
      if (fileBlobUrl) window.URL.revokeObjectURL(fileBlobUrl);
    };
  }, [fileBlobUrl, doc?.id]);

  // 🚀 Auto-refresh preview immediately when document is digitally signed
  useEffect(() => {
    if (doc?.signedTimestamp) {
      setLocalSigned(true);
      if (fileBlobUrl) {
        window.URL.revokeObjectURL(fileBlobUrl);
        setFileBlobUrl(null);
      }
      executeFileFetch('view', doc.pinUsed || null);
    }
  }, [doc?.signedTimestamp]);

  useEffect(() => {
    if (doc) {
      if (lastFetchedDocId.current === doc.id) return;
      lastFetchedDocId.current = doc.id;

      if (doc.encrypted) {
        setPendingAction('view');
        setShowPinModal(true);
      } else {
        executeFileFetch('view', null);
      }
    }
  }, [doc?.id]);

  if (!doc) return null;
  const isPdf = doc.name.toLowerCase().endsWith('.pdf');

  const handleActionRequest = (action) => {
    if (doc.encrypted) {
      setPendingAction(action);
      setShowPinModal(true);
    } else {
      executeFileFetch(action, null);
    }
  };

  const executeFileFetch = async (action, enteredPin) => {
    setIsFetching(true);
    try {
      let blob;

      if (doc.encrypted || doc.storageMode === 'Encrypted') {
        if (!enteredPin) throw new Error("PIN is required for encrypted files.");
        
        const response = await api.post(`/vault/${doc.id}/download`, { pin: enteredPin });
        const data = response.data;

        // 🚀 FIX: Accept either ownerWrappedKey (for owner) OR rawFileKey (for recipient)
        if (!data || !data.fileData || (!data.ownerWrappedKey && !data.rawFileKey)) {
            throw new Error("Invalid or corrupted file data received from server.");
        }

        let unlockedAesKey;
        try {
            if (data.rawFileKey) {
                // 🚀 Recipient Flow: Backend already unwrapped RSA, use the raw AES key directly
                unlockedAesKey = data.rawFileKey;
            } else if (data.ownerWrappedKey) {
                // 🚀 Owner Flow: Standard AES-GCM unwrap using Master PIN
                unlockedAesKey = await unwrapUserKey(data.ownerWrappedKey, enteredPin); 
            }
        } catch (e) {
            throw new Error("Incorrect Master PIN. Failed to unwrap key.");
        }

        let decryptedBuffer;
        try {
            const cleanFiledata = typeof data.fileData === 'string' ? data.fileData.trim() : String(data.fileData);
            decryptedBuffer = await decryptFileInBrowser(cleanFiledata, unlockedAesKey);
        } catch (e) {
            throw new Error("Decryption failed.");
        }
        
        blob = new Blob([decryptedBuffer], { type: getMimeType(doc.name) });

      } else {
        const response = await api.post(`/vault/${doc.id}/download`, {}, { responseType: 'blob' });
        blob = new Blob([response.data], { type: getMimeType(doc.name) });
      }

      if (fileBlobUrl) window.URL.revokeObjectURL(fileBlobUrl);
      const url = window.URL.createObjectURL(blob);

      if (action === 'view') {
        setFileBlobUrl(url);
      } else if (action === 'sign') {
        setFileBlobUrl(url);
        onOpenSign(doc, url);
      } else if (action === 'download') {
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', doc.name);
        document.body.appendChild(link);
        link.click();
        link.parentNode.removeChild(link);
        window.URL.revokeObjectURL(url); 
      }

      setShowPinModal(false);
      setPin('');
      if(action === 'view') {
        addToast("Document loaded successfully.", "success");
      }
    } catch (error) {
      console.error("File processing error:", error);
      addToast(error.response?.data?.error || error.message || "Failed to access document.", "error");
    } finally {
      setIsFetching(false);
    }
  };

  const handleUnsign = async () => {
    if (!window.confirm("Are you sure you want to remove the signature from this document?")) return;
    
    setIsFetching(true);
    try {
      await api.post(`/documents/${doc.id}/unsign`); 
      setLocalSigned(false);
      addToast("Signature removed successfully. Document is now unlocked.", "success");
    } catch (error) {
      console.error("Unsign error:", error);
      addToast(error.response?.data?.error || "Failed to remove signature.", "error");
    } finally {
      setIsFetching(false);
    }
  };

  const handleSignClick = () => {
    if (doc.encrypted && !fileBlobUrl) {
      setPendingAction('sign');
      setShowPinModal(true);
    } else {
      onOpenSign(doc, fileBlobUrl);
    }
  };

  const renderPreview = () => {
    const ext = doc.name.split('.').pop().toLowerCase();

    // 🚀 DOCX Documents: Dedicated in-browser Word document renderer
    if (ext === 'docx') {
      return <DocxViewer fileBlobUrl={fileBlobUrl} className="rounded-lg" />;
    }

    // 🚀 Browser-renderable formats: PDFs, Text, Code, HTML, JSON, Markdown, etc.
    if (['pdf', 'txt', 'html', 'json', 'csv', 'xml', 'md', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'php', 'css', 'scss', 'log', 'rtf'].includes(ext)) {
      return (
        <iframe 
          src={`${fileBlobUrl}#toolbar=1`} 
          className="w-full h-full rounded-lg bg-white" 
          title={doc.name} 
        />
      );
    }

    // 🚀 Images
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp', 'webp', 'tiff', 'ico'].includes(ext)) {
      return (
        <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
          <img src={fileBlobUrl} alt={doc.name} className="max-w-full max-h-full rounded shadow-lg object-contain" />
        </div>
      );
    }

    // 🚀 Video
    if (['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv', '3gp'].includes(ext)) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-black rounded-lg">
          <video src={fileBlobUrl} controls className="max-w-full max-h-full rounded outline-none" />
        </div>
      );
    }

    // 🚀 Audio
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-slate-900/50">
          <Music className="w-24 h-24 text-pink-500 mb-8 animate-pulse" />
          <audio src={fileBlobUrl} controls className="w-full max-w-md outline-none" />
        </div>
      );
    }

    // Fallback for Office (.doc, .xlsx, .pptx), Archives (.zip, .rar) or Binary Files
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <div className="mb-4">{getFileIcon(doc.name, false)}</div>
        <p className="text-slate-300 font-medium mb-2">File loaded successfully!</p>
        <p className="text-slate-500 text-sm max-w-sm mb-4">
          Direct in-browser preview is not available for <code>.{ext}</code> files. Please download the file to view it in your application.
        </p>
        <Button variant="outline" icon={Download} onClick={() => handleActionRequest('download')}>
          Download {doc.name}
        </Button>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <button onClick={onBack} className="mr-4 p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-full transition-colors">
            <ChevronRight className="w-5 h-5 transform rotate-180" />
          </button>
          <h2 className="text-xl font-bold text-slate-100 flex items-center">
            {getFileIcon(doc.name, doc.encrypted)}
            {doc.name}
          </h2>
        </div>
        <div className="flex space-x-2">
          {doc.role !== 'Viewer' && (
            <>
              {/* Show SIGN if not signed */}
              {isPdf && !localSigned && (
                <Button variant="outline" icon={PenTool} onClick={handleSignClick}>Sign</Button>
              )}
              
              {/* Show UNSIGN if already signed */}
              {isPdf && localSigned && (
                <Button 
                  variant="outline" 
                  icon={PenTool} 
                  onClick={() => setShowUnsignModal(true)}
                  className="text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                >
                  Unsign
                </Button>
              )}
              
              <Button variant="outline" icon={Share2} onClick={() => onOpenShare(doc)}>Share</Button>
            </>
          )}
          <Button 
            variant="primary" 
            icon={isFetching && pendingAction === 'download' ? Loader : Download} 
            onClick={() => handleActionRequest('download')} 
            disabled={isFetching}
            className={isFetching && pendingAction === 'download' ? "animate-pulse" : ""}
          >
            {isFetching && pendingAction === 'download' ? 'Processing...' : 'Download'}
          </Button>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        <div className="flex-1 bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col relative overflow-hidden shadow-inner">
          {fileBlobUrl ? (
            <div className="w-full h-full p-2 bg-white/5 relative">
               {renderPreview()}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center relative">
              <div className="absolute top-4 right-4 flex space-x-2">
                {isPdf && localSigned && <Badge variant="success">Signature Valid</Badge>}
                {isPdf && !localSigned && <Badge variant="warning">Unsigned PDF</Badge>}
              </div>
              
              <div className="mb-4 opacity-50">{getFileIcon(doc.name, doc.encrypted)}</div>
              <p className="text-slate-400 font-medium text-lg mb-4">
                {doc.encrypted ? 'Encrypted Document Vaulted' : 'Secure Document Preview'}
              </p>
              
              <Button variant="outline" icon={Eye} onClick={() => handleActionRequest('view')} disabled={isFetching}>
                 {isFetching && pendingAction === 'view' ? 'Decrypting...' : doc.encrypted ? 'Enter PIN to View' : 'Reload Preview'}
              </Button>
            </div>
          )}
        </div>

        <div className="w-80 flex-shrink-0 flex flex-col space-y-6 overflow-y-auto pr-2">
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-100 mb-4 border-b border-slate-800 pb-2">Properties</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Owner</span><span className="font-medium text-slate-200">{doc.owner}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Modified</span><span className="font-medium text-slate-200">{doc.date}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Size</span><span className="font-medium text-slate-200">{doc.size}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Type</span><span className="font-medium text-slate-200 uppercase">{doc.name.split('.').pop()}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Storage</span><span className="font-medium text-indigo-400 flex items-center">{doc.encrypted ? <><Lock className="w-3 h-3 mr-1"/> AES-256</> : 'Standard'}</span></div>
            </div>
          </div>
          
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-100 mb-4 border-b border-slate-800 pb-2 flex justify-between items-center">
              Access List <Users className="w-4 h-4 text-slate-500"/>
            </h3>
            <div className="space-y-4">
              
              {/* 1. Show Owner */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 relative group cursor-default">
                  <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${doc.role === 'Owner' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 border border-slate-700 text-slate-300'}`}>
                    {doc.role === 'Owner' ? (JSON.parse(localStorage.getItem('user'))?.name?.substring(0,2).toUpperCase() || 'ME') : doc.owner.substring(0,2).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-slate-200 truncate">{doc.role === 'Owner' ? 'You' : doc.owner}</span>
                  </div>
                  
                  <div className="absolute left-11 top-8 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 bg-slate-800 text-slate-300 text-xs px-2.5 py-1 rounded border border-slate-700 shadow-xl whitespace-nowrap pointer-events-none">
                    {doc.role === 'Owner' ? JSON.parse(localStorage.getItem('user'))?.email : 'Document Owner'}
                  </div>
                </div>
                <Badge variant="default" className="shrink-0">Owner</Badge>
              </div>

              {/* 2. Map through all Shared Users dynamically */}
              {doc.sharedUsers && doc.sharedUsers.map((user, idx) => {
                const currentUser = JSON.parse(localStorage.getItem('user'));
                const isMe = user.id === currentUser?.id;
                
                return (
                  <div key={idx} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 relative group cursor-default">
                      <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${isMe ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 border border-slate-700 text-slate-300'}`}>
                        {user.name.substring(0,2).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium text-slate-200 truncate">{isMe ? 'You' : user.name}</span>
                      </div>

                      <div className="absolute left-11 top-8 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 bg-slate-800 text-slate-300 text-xs px-2.5 py-1 rounded border border-slate-700 shadow-xl whitespace-nowrap pointer-events-none">
                        {user.email}
                      </div>
                    </div>
                    <Badge variant="default" className="shrink-0">{user.role}</Badge>
                  </div>
                );
              })}

            </div>
          </div>
          
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-100 mb-4 border-b border-slate-800 pb-2 flex justify-between items-center">
              Integrity Status <ShieldCheck className="w-4 h-4 text-slate-500"/>
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Digital Signature</span>
                {localSigned ? (
                  <span className="text-emerald-400 font-medium flex items-center">
                    <CheckCircle className="w-4 h-4 mr-1 text-emerald-400" /> Signed & Verified
                  </span>
                ) : (
                  <span className="text-slate-500 font-medium">Unsigned</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* UNSIGN CONFIRMATION MODAL */}
      <Modal isOpen={showUnsignModal} onClose={() => !isUnsigning && setShowUnsignModal(false)} title="Remove Digital Signature?">
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3 flex text-amber-200/90 text-sm">
            <ShieldAlert className="w-5 h-5 mr-3 flex-shrink-0 text-amber-400" />
            <p>Removing the digital signature will restore the document to its original unsigned state. This action will be logged in the immutable audit trail.</p>
          </div>
          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" onClick={() => setShowUnsignModal(false)} disabled={isUnsigning}>Cancel</Button>
            <Button variant="danger" onClick={executeUnsign} disabled={isUnsigning} className="bg-amber-600 hover:bg-amber-500 text-white">
              {isUnsigning ? 'Removing Signature...' : 'Yes, Remove Signature'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* PIN Unlock Modal for Decrypting in Document View */}
      <Modal isOpen={showPinModal} onClose={() => !isFetching && setShowPinModal(false)} title="Enter Master PIN">
        <div className="space-y-4">
          <div className="bg-indigo-500/10 border border-indigo-500/30 rounded p-3 flex text-indigo-200/90 text-sm">
            <Lock className="w-5 h-5 mr-3 flex-shrink-0 text-indigo-400" />
            <p>"{doc.name}" is protected by AES-256-GCM. Enter your Master PIN to decrypt and access this file.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Master PIN</label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-indigo-400" />
              <input
                type="password"
                maxLength={6}
                value={pin}
                autoFocus
                onChange={(e) => setPin(e.target.value)}
                className="w-full pl-10 pr-3 py-2 bg-slate-950 border border-indigo-500/50 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                placeholder="******"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
            <Button variant="ghost" onClick={() => setShowPinModal(false)} disabled={isFetching}>Cancel</Button>
            <Button variant="primary" onClick={() => executeFileFetch(pendingAction, pin)} disabled={pin.length < 6 || isFetching} className="bg-indigo-600 hover:bg-indigo-500 text-white">
              {isFetching ? 'Decrypting...' : 'Unlock & Proceed'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DocumentDetail;