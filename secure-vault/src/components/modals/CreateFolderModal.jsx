import React, { useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { Modal, Button } from '../SharedUI';
import api from '../../api/axiosConfig';

const CreateFolderModal = ({ isOpen, onClose, onFolderCreated, currentFolder }) => {
  const [folderName, setFolderName] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    setCreating(true);

    try {
      const activeParentId = currentFolder ? currentFolder.id : null;
      const response = await api.post('/documents/create-folder', {
        folderName: folderName.trim(),
        parentId: activeParentId //nested folders 
      });
      
      // Instantly update the UI with the new folder
      onFolderCreated({
        id: response.data.folder._id,
        name: response.data.folder.fileName,
        owner: "me", // Uses local mock mapping for now
        date: new Date().toISOString().split('T')[0],
        size: '—',
        encrypted: false,
        signed: false,
        role: "Owner",
        type: 'folder',
        parentId: activeParentId
      });
      
      setFolderName('');
      onClose();
    } catch (error) {
      console.error("Create folder error:", error);
      alert(error.response?.data?.error || "Failed to create folder.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Folder">
      <form onSubmit={handleCreate} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">Folder Name</label>
          <div className="relative">
            <FolderPlus className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="e.g., Financial Reports 2026"
              className="w-full pl-10 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>
        <div className="flex justify-end space-x-3 pt-4 border-t border-slate-800">
          <Button variant="ghost" onClick={onClose} disabled={creating}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={creating || !folderName.trim()}>
            {creating ? 'Creating...' : 'Create Folder'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default CreateFolderModal;