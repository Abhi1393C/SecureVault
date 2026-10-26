import React, { useState, useEffect } from 'react'; 
import api from './api/axiosConfig';

// 1. Pages Imports
import LandingPage from './pages/LandingPage';
import AuthPage from './pages/AuthPage';
import PinSetupPage from './pages/PinSetupPage';
import AuditLogPage from './pages/AuditLogPage';
import VerifyPage from './pages/VerifyPage';
import SettingsPage from './pages/SettingsPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

// 2. Layout & Document Components Imports
import DashboardLayout from './components/layout/DashboardLayout';
import DocumentList from './components/documents/DocumentList';
import DocumentDetail from './components/documents/DocumentDetail';
import BinView from './components/documents/BinView';
import { useToast } from './components/ToastContext'; 
import PublicView from './components/public/PublicView';

// 3. Modals Imports
import UploadModal from './components/modals/UploadModal';
import SignModal from './components/modals/SignModal';
import ShareModal from './components/modals/ShareModal';
import MoveFileModal from './components/modals/MoveFileModal';
import CreateFolderModal from './components/modals/CreateFolderModal';

export default function App() {
  const { addToast } = useToast(); 

  const getInitialRoute = () => {
    const path = window.location.pathname.substring(1); 
    if (path.startsWith('reset-password/')) return path;
    if (path.startsWith('view/')) return path; // 🚀 Handle external view route
    
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (token) return 'dashboard';
    
    const validRoutes = ['login', 'register', 'forgot', 'pin-setup']; 
    return validRoutes.includes(path) ? path : 'landing';
  };

  // --- STATE MANAGEMENT ---
  const [route, setRoute] = useState(getInitialRoute()); 
  const [view, setView] = useState(() => localStorage.getItem('activeView') || 'dashboard'); 
  const [docs, setDocs] = useState([]); 
  const [binDocs, setBinDocs] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [currentFolder, setCurrentFolder] = useState(() => {
    const savedFolder = localStorage.getItem('activeFolder');
    return savedFolder ? JSON.parse(savedFolder) : null;
  });
  
  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState(false); 
  const [isSignOpen, setIsSignOpen] = useState(false); 
  const [isShareOpen, setIsShareOpen] = useState(false); 
  const [modalDocContext, setModalDocContext] = useState(null); 
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [docToMove, setDocToMove] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // --- BROWSER HISTORY SYNC ---
  useEffect(() => {
    const currentPath = window.location.pathname;
    if (currentPath === '/') {
      window.history.replaceState({ route: 'landing' }, '', '/');
    }

    const handlePopState = (event) => {
      if (event.state && event.state.route) {
        setRoute(event.state.route);
        if (event.state.route === 'dashboard') {
          setView('dashboard');
          setSelectedDoc(null);
        }
      } else {
        const path = window.location.pathname.substring(1);
        if (path.startsWith('view/') || path.startsWith('reset-password/')) {
          setRoute(path);
        } else {
          setRoute('landing');
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch active documents
  useEffect(() => {
    const fetchDocuments = async () => {
      if (route === 'dashboard') {
        try {
          const response = await api.get('/documents');
          setDocs(response.data);
        } catch (error) {
          console.error("Failed to fetch documents", error);
        }
      }
    };
    fetchDocuments();
  }, [route]);

  // Fetch Bin documents when view changes to 'bin'
  useEffect(() => {
    if (view === 'bin') {
      api.get('/vault/bin/all').then(res => setBinDocs(res.data)).catch(console.error);
    }
  }, [view]);

  // Handle Move to Bin with Toast feedback
  const handleMoveToBin = async (docId) => {
    try {
      await api.patch(`/vault/${docId}/bin`);
      const response = await api.get('/documents');
      setDocs(response.data);
      addToast("Moved to bin successfully", "success");
    } catch (error) {
      console.error("Failed to move to bin", error);
      addToast("Failed to move to bin", "error");
    }
  };

  const navigate = (newRoute) => {
    setRoute(newRoute);
    window.history.pushState(
      { route: newRoute }, 
      '', 
      newRoute === 'landing' ? '/' : `/${newRoute}`
    );
    if (newRoute === 'dashboard') {
      setView('dashboard');
      setSelectedDoc(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('vault_is_locked');
    sessionStorage.removeItem('vault_last_activity');
    navigate('landing');
  };

  // --- DOCUMENT ACTIONS ---
  const handleViewDoc = (doc) => {
    if (doc.type === 'folder') {
      setCurrentFolder(doc);
      localStorage.setItem('activeFolder', JSON.stringify(doc));
      setSelectedDoc(null);
    } else {
      const now = new Date().toISOString();
      setDocs(prevDocs => prevDocs.map(d => 
        d.id === doc.id ? { ...d, lastAccessed: now } : d
      ));
      setSelectedDoc(doc);
    }
  };

  const handleNavigateBack = () => {
    if (currentFolder && currentFolder.parentId) {
      const parentFolder = docs.find(doc => doc.id === currentFolder.parentId);
      setCurrentFolder(parentFolder || null);
      if (parentFolder) {
        localStorage.setItem('activeFolder', JSON.stringify(parentFolder));
      } else {
        localStorage.removeItem('activeFolder');
      }
    } else {
      setCurrentFolder(null);
      localStorage.removeItem('activeFolder');
    }
  };

  const handleUploadNew = async (newDoc) => {
    if (newDoc === null) {
      // Folder upload completed — re-fetch all documents to reflect new hierarchy
      try {
        const response = await api.get('/documents');
        setDocs(response.data);
        addToast("Folder uploaded successfully!", "success");
      } catch (err) {
        console.error("Failed to refresh documents after folder upload", err);
      }
    } else {
      setDocs([newDoc, ...docs]);
      addToast("Uploaded successfully", "success");
    }
  };
  
  const handleSignedSuccess = (docId, pinUsed) => {
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, signed: true } : d)); 
    if (selectedDoc && selectedDoc.id === docId) {
      setSelectedDoc(prev => ({ 
        ...prev, 
        signed: true, 
        signedTimestamp: Date.now(), 
        pinUsed: pinUsed 
      })); 
    }
  };

  const openSignModal = (doc, blobUrl = null) => { 
    setModalDocContext({ ...doc, blobUrl }); 
    setIsSignOpen(true); 
  }; 
  const openShareModal = (doc) => { setModalDocContext(doc); setIsShareOpen(true); }; 

  const handleOpenMoveModal = (doc) => { 
    setDocToMove(doc); 
    setIsMoveOpen(true); 
  };

  const handleConfirmMove = async (documentId, newParentId) => {
    try {
      await api.post('/documents/move', { documentId, newParentId });
      setDocs(docs.map(d => d.id === documentId ? { ...d, parentId: newParentId } : d));
      addToast("Document moved successfully", "success");
    } catch (error) {
      console.error("Failed to move document:", error);
      addToast(error.response?.data?.error || "Failed to move the document.", "error");
    }
  };

  const handleSetView = (newView) => {
    if (newView === 'uploadModal') {
      setIsUploadOpen(true); 
    } else if (newView === 'createFolderModal') {
      setIsCreateFolderOpen(true);
    } else {
      setView(newView); 
      localStorage.setItem('activeView', newView); 
      setSelectedDoc(null); 
    }
  };

  // --- ROUTE RENDERING CONDITIONS ---
  if (route === 'landing') return <LandingPage navigate={navigate} />; 
  
  if (route.startsWith('reset-password/')) {
    const resetToken = route.split('/')[1]; 
    return <ResetPasswordPage token={resetToken} navigate={navigate} />;
  }

  // 🚀 Handle Public External Share Links
  if (route.startsWith('view/')) {
    return <PublicView />;
  }

  if (route === 'login' || route === 'register' || route === 'forgot') return <AuthPage type={route} navigate={navigate} />; 
  if (route === 'pin-setup') return <PinSetupPage navigate={navigate} />; 

  return (
    <DashboardLayout 
      currentView={view} 
      setView={handleSetView} 
      onLogout={handleLogout}
      searchQuery={searchQuery}
      setSearchQuery={setSearchQuery}
      isDocumentOpen={!!selectedDoc}
    >
      {selectedDoc ? (
        <DocumentDetail 
          doc={selectedDoc} 
          onBack={() => setSelectedDoc(null)} 
          onOpenSign={openSignModal}
          onOpenShare={openShareModal}
        />
      ) : (
        <>
          {view === 'dashboard' && (
            <DocumentList 
              docs={docs.filter(d => d.role === 'Owner')} 
              title={searchQuery ? `Search Results in My Documents` : (currentFolder ? currentFolder.name : "My Documents")} 
              currentFolder={currentFolder}
              searchQuery={searchQuery}
              onNavigateBack={handleNavigateBack}
              onViewDoc={handleViewDoc} 
              onShareDoc={openShareModal}
              onMoveDoc={handleOpenMoveModal} 
              onMoveToBin={handleMoveToBin} 
            />
          )}

          {view === 'shared' && (
            <DocumentList 
              docs={docs.filter(d => d.role !== 'Owner')} 
              title={searchQuery ? `Search Results in Shared With Me` : "Shared With Me"} 
              searchQuery={searchQuery}
              onViewDoc={handleViewDoc} 
              onShareDoc={openShareModal}
              onMoveDoc={handleOpenMoveModal} 
              onMoveToBin={handleMoveToBin} 
              isGlobalView={true} 
            />
          )}
          
          {view === 'recent' && (
            <DocumentList 
              docs={docs.filter(d => d.type !== 'folder')} 
              title={searchQuery ? `Search Results in Recent` : "Recent Documents"} 
              searchQuery={searchQuery}
              onViewDoc={handleViewDoc} 
              onShareDoc={openShareModal}
              onMoveDoc={handleOpenMoveModal} 
              onMoveToBin={handleMoveToBin} 
              isGlobalView={true} 
              viewType="recent" 
              getFolderName={(parentId) => { 
                if (!parentId) return 'My Documents';
                const folder = docs.find(d => d.id === parentId);
                return folder ? folder.name : 'Unknown';
              }}
            />
          )}

          {/* Bin View Integration */}
          {view === 'bin' && (
            <BinView 
              docs={binDocs} 
              setBinDocs={setBinDocs} 
              onRestore={async (id) => {
                try {
                  await api.patch(`/vault/${id}/restore`);
                  setBinDocs(binDocs.filter(d => d.id !== id));
                  const restored = await api.get('/documents');
                  setDocs(restored.data);
                  addToast("Document restored successfully", "success");
                } catch (error) {
                  addToast("Failed to restore document", "error");
                }
              }}
              onPermanentDelete={async (id) => {
                try {
                  await api.delete(`/vault/${id}/permanent`);
                  setBinDocs(binDocs.filter(d => d.id !== id));
                  addToast("Permanently deleted", "success");
                } catch (error) {
                  addToast("Failed to delete", "error");
                }
              }}
              onEmptyBin={async () => {
                try {
                  await api.delete('/vault/bin/empty');
                  setBinDocs([]);
                  addToast("Bin emptied successfully", "success");
                } catch (error) {
                  addToast("Failed to empty bin", "error");
                }
              }}
            />
          )}
          
          {view === 'audit' && <AuditLogPage />}
          {view === 'verify' && <VerifyPage />}
          {view === 'settings' && <SettingsPage />}
        </>
      )}

      {/* Global Modals */}
      <UploadModal 
        isOpen={isUploadOpen} 
        onClose={() => setIsUploadOpen(false)} 
        currentFolder={currentFolder} 
        onUpload={handleUploadNew} 
      />
      <SignModal 
        isOpen={isSignOpen} 
        onClose={() => setIsSignOpen(false)} 
        doc={modalDocContext} 
        fileBlobUrl={modalDocContext?.blobUrl}
        onSignedSuccess={handleSignedSuccess} 
      />
      <ShareModal isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} doc={modalDocContext} />
      
      <MoveFileModal 
        isOpen={isMoveOpen} 
        onClose={() => setIsMoveOpen(false)} 
        docToMove={docToMove} 
        folders={docs.filter(d => d.type === 'folder')} 
        onConfirmMove={handleConfirmMove} 
      />

      <CreateFolderModal 
        isOpen={isCreateFolderOpen} 
        onClose={() => setIsCreateFolderOpen(false)} 
        onFolderCreated={(newFolder) => setDocs([newFolder, ...docs])} 
        currentFolder={currentFolder}
      />
    </DashboardLayout>
  ); 
}