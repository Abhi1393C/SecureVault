import React, { useState } from 'react';
import { LinkIcon as LinkIcon, Lock, Key, RefreshCw, Users } from 'lucide-react';
import { Modal, Button } from '../SharedUI';
import api from '../../api/axiosConfig';
import { useToast } from '../ToastContext';

const ShareModal = ({ isOpen, onClose, doc }) => {
  const { addToast } = useToast();
  const [tab, setTab] = useState('invite');

  // Form States
  const [targetEmail, setTargetEmail] = useState('');
  const [role, setRole] = useState('Viewer');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  // External Link States
  const [expiryHours, setExpiryHours] = useState('24');
  const [generatedLink, setGeneratedLink] = useState('');
  const [generatingLink, setGeneratingLink] = useState(false);

  // Helper check for encryption across different schema variations
  const isEncryptedFile = doc?.storageMode === 'Encrypted' || doc?.encrypted;

  const handleInternalShare = async (e) => {
    e.preventDefault();
    if (!targetEmail) {
      addToast("Please enter a recipient email address.", "error");
      return;
    }

    // If document is encrypted, Master PIN is mandatory as enforced by backend controller
    if (isEncryptedFile && !pin) {
      addToast("Master PIN is required to share an encrypted document.", "error");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/share/internal', {
        documentId: doc.id || doc._id,
        targetEmail: targetEmail.trim(),
        role: role,
        pin: isEncryptedFile ? pin : undefined
      });

      addToast(response.data.message || `Successfully shared with ${targetEmail}`, "success");
      setTargetEmail('');
      setPin('');
      onClose();
    } catch (error) {
      console.error("Sharing error:", error);
      addToast(error.response?.data?.error || "Failed to share document.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExternalLink = async () => {
    if (isEncryptedFile) {
      addToast("Encrypted files cannot be shared externally due to security policies.", "error");
      return;
    }

    setGeneratingLink(true);
    try {
      const response = await api.post('/share/external', {
        documentId: doc.id || doc._id,
        expiryHours: parseInt(expiryHours, 10)
      });

      setGeneratedLink(response.data.link);
      addToast("External secure link generated!", "success");
    } catch (error) {
      console.error("External link error:", error);
      addToast(error.response?.data?.error || "Failed to generate link.", "error");
    } finally {
      setGeneratingLink(false);
    }
  };

  const copyToClipboard = () => {
    if (!generatedLink) return;
    navigator.clipboard.writeText(generatedLink);
    addToast("Link copied to clipboard!", "success");
  };

  const currentUser = JSON.parse(localStorage.getItem('user'));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Share "${doc?.name}"`}>
      <div className="mb-4 flex border-b border-slate-800">
        <button onClick={() => setTab('invite')} className={`pb-2 px-4 text-sm font-medium ${tab === 'invite' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-slate-400 hover:text-slate-300'}`}>Invite People</button>
        <button onClick={() => setTab('link')} className={`pb-2 px-4 text-sm font-medium ${tab === 'link' ? 'border-b-2 border-emerald-500 text-emerald-400' : 'text-slate-400 hover:text-slate-300'}`}>Get Link</button>
      </div>

      {tab === 'invite' ? (
        <form onSubmit={handleInternalShare} className="space-y-4">
          <div className="flex space-x-2">
            <input 
              type="email" 
              placeholder="Add email address" 
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              className="flex-1 bg-slate-950 text-white border border-slate-700 placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:ring-emerald-500 focus:border-emerald-500" 
            />
            <select 
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="border border-slate-700 rounded-lg px-3 py-2 text-sm bg-slate-950 text-white focus:ring-emerald-500 focus:border-emerald-500"
            >
              <option value="Viewer">Viewer</option>
              <option value="Editor">Editor</option>
            </select>
            <Button variant="primary" type="submit" disabled={loading}>
              {loading ? 'Sharing...' : 'Invite'}
            </Button>
          </div>

          {/* Master PIN field appears dynamically if document is encrypted */}
          {isEncryptedFile && (
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-lg p-3 space-y-2">
              <label className="block text-xs font-medium text-indigo-300 flex items-center">
                <Lock className="w-3.5 h-3.5 mr-1 text-indigo-400" /> Master PIN Required (Zero-Knowledge Decryption)
              </label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-indigo-400" />
                <input 
                  type="password" 
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="Enter 6-digit PIN"
                />
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-800">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">People with access</h4>
            
            {/* 🚀 DYNAMIC ACCESS LIST */}
            <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
              
              {/* 1. Owner Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${doc?.role === 'Owner' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 border border-slate-700 text-slate-300'}`}>
                    {doc?.role === 'Owner' ? (currentUser?.name?.substring(0,2).toUpperCase() || 'ME') : (doc?.owner?.substring(0,2).toUpperCase() || 'OW')}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-100">{doc?.role === 'Owner' ? 'You' : (doc?.owner || 'Owner')}</p>
                    <p className="text-xs text-slate-400">{doc?.role === 'Owner' ? currentUser?.email : 'Document Owner'}</p>
                  </div>
                </div>
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">Owner</span>
              </div>

              {/* 2. Shared Users Rows */}
              {doc?.sharedUsers && doc.sharedUsers.map((user, idx) => {
                const isMe = user.id === currentUser?.id;
                return (
                  <div key={idx} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isMe ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 border border-slate-700 text-slate-300'}`}>
                        {user.name.substring(0,2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-100">{isMe ? 'You' : user.name}</p>
                        <p className="text-xs text-slate-400">{user.email}</p>
                      </div>
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">{user.role}</span>
                  </div>
                );
              })}

            </div>
          </div>
        </form>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-100">External Link Access</p>
              <p className="text-xs text-slate-400">
                {isEncryptedFile ? '❌ Encrypted files cannot be shared externally' : 'Anyone with the link can view'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-100">Link Expiry</p>
            </div>
            <select 
              value={expiryHours} 
              onChange={(e) => setExpiryHours(e.target.value)}
              className="border border-slate-700 rounded-lg px-2 py-1 text-sm bg-slate-950 text-white"
            >
              <option value="24">24 Hours</option>
              <option value="48">48 Hours</option>
              <option value="168">7 Days</option>
            </select>
          </div>

          {!isEncryptedFile ? (
            <div className="space-y-3 pt-2">
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  readOnly 
                  value={generatedLink || "Click 'Generate Link' to create secure URL"} 
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400" 
                />
                {generatedLink ? (
                  <Button variant="outline" icon={LinkIcon} onClick={copyToClipboard}>Copy</Button>
                ) : (
                  <Button variant="primary" onClick={handleCreateExternalLink} disabled={generatingLink}>
                    {generatingLink ? 'Generating...' : 'Generate'}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg text-xs text-red-300">
              Security Policy Note: End-to-end encrypted documents require internal user authentication and cannot generate public URLs.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default ShareModal;