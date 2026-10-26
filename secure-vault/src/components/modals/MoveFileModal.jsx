import React, { useState, useEffect } from 'react';
import { Folder, Home, ChevronLeft, ChevronRight } from 'lucide-react';
import { Modal, Button } from '../SharedUI';

const MoveFileModal = ({ isOpen, onClose, docToMove, folders, onConfirmMove }) => {
  // Track where the user is currently browsing INSIDE the modal
  const [currentFolderId, setCurrentFolderId] = useState(null);
  
  // Track which folder is actively highlighted/selected as the target
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  
  const [isMoving, setIsMoving] = useState(false);

  // Reset modal state every time it opens
  useEffect(() => {
    if (isOpen) {
      setCurrentFolderId(null);
      setSelectedFolderId(null);
    }
  }, [isOpen]);

  if (!docToMove) return null;

  // Find the current folder object so we can get its name and parent
  const currentFolderObj = folders.find(f => f.id === currentFolderId);

  // Filter folders to ONLY show ones that belong inside the current view
  // (and prevent moving a folder into itself)
  const visibleFolders = folders.filter(f => 
    f.parentId === currentFolderId && f.id !== docToMove.id
  );

  // Navigate INTO a folder
  const handleNavigateIn = (e, folderId) => {
    e.stopPropagation();
    setCurrentFolderId(folderId);
    setSelectedFolderId(null); // Clear selection when entering a new folder
  };

  // Navigate UP one level
  const handleNavigateUp = () => {
    if (currentFolderObj) {
      setCurrentFolderId(currentFolderObj.parentId || null);
      setSelectedFolderId(null);
    }
  };

  const handleMove = () => {
    setIsMoving(true);
    
    // If a folder is highlighted in the list, move it THERE.
    // If nothing is highlighted, move it to the CURRENT folder we are viewing.
    const destinationId = selectedFolderId !== null ? selectedFolderId : currentFolderId;

    setTimeout(() => {
      onConfirmMove(docToMove.id, destinationId);
      setIsMoving(false);
      onClose();
    }, 800);
  };

  // Determine the display name of the target destination
  let targetName = 'My Documents (Root)';
  if (selectedFolderId) {
    targetName = folders.find(f => f.id === selectedFolderId)?.name;
  } else if (currentFolderId) {
    targetName = currentFolderObj?.name;
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Move to Folder">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-400 truncate pr-4">
          Moving <span className="font-semibold text-slate-200">{docToMove.name}</span>
        </p>
      </div>

      {/* Navigation Header */}
      <div className="flex items-center mb-3 px-1">
        {currentFolderId !== null ? (
          <button 
            onClick={handleNavigateUp} 
            className="flex items-center text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </button>
        ) : (
          <div className="flex items-center text-sm font-medium text-slate-300">
            <Home className="w-4 h-4 mr-2" /> My Documents
          </div>
        )}
      </div>

      {/* Folder List Area */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 h-60 overflow-y-auto space-y-1 mb-4 shadow-inner">
        
        {visibleFolders.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <Folder className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-sm">This folder is empty</p>
          </div>
        )}

        {visibleFolders.map(folder => (
          <div 
            key={folder.id}
            onClick={() => setSelectedFolderId(folder.id)}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer border ${
              selectedFolderId === folder.id 
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                : 'text-slate-300 hover:bg-slate-800 border-transparent'
            }`}
          >
            <div className="flex items-center flex-1 truncate">
              <Folder className={`w-5 h-5 mr-3 flex-shrink-0 ${selectedFolderId === folder.id ? 'text-emerald-500' : 'text-slate-500'}`} />
              <span className="truncate">{folder.name}</span>
            </div>
            
            {/* The Arrow button to go inside the folder */}
            <button 
              onClick={(e) => handleNavigateIn(e, folder.id)}
              className="p-1.5 ml-2 hover:bg-slate-700 rounded-md transition-colors text-slate-500 hover:text-white"
              title={`Open ${folder.name}`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Footer Controls */}
      <div className="flex justify-between items-center border-t border-slate-800 pt-4">
        <div className="text-xs text-slate-500 truncate max-w-[150px] sm:max-w-[200px]" title={targetName}>
          Target: <span className="text-slate-300 font-medium">{targetName}</span>
        </div>
        <div className="flex space-x-3">
          <Button variant="ghost" onClick={onClose} disabled={isMoving}>Cancel</Button>
          <Button 
            variant="primary" 
            onClick={handleMove} 
            disabled={isMoving}
            className={isMoving ? 'animate-pulse' : ''}
          >
            {isMoving ? 'Moving...' : 'Move Here'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default MoveFileModal;