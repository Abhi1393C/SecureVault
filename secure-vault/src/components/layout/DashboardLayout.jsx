import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Share2, Activity, ShieldCheck, Settings, 
  LogOut, Search, Bell, UploadCloud, Clock, FolderPlus, Trash2, X as XIcon,
  Lock, Key, AlertCircle, Loader2 
} from 'lucide-react'; 
import { Button } from '../SharedUI'; 
import useInactivityLock from '../../hooks/useInactivityLock';
import api from '../../api/axiosConfig';
import { useToast } from '../ToastContext';

const DashboardLayout = ({ 
  children, 
  currentView, 
  setView, 
  onLogout, 
  searchQuery = '', 
  setSearchQuery = () => {},
  isDocumentOpen = false 
}) => {
  const { addToast } = useToast();
  const [userName, setUserName] = useState('User');
  const [userInitials, setUserInitials] = useState('U');
  const searchRef = useRef(null);

  // ─── Inactivity Auto-Lock Hook (5 minutes = 300,000ms) ──────────────────
  const { isLocked, unlock } = useInactivityLock(5 * 60 * 1000);
  const [unlockPin, setUnlockPin] = useState('');
  const [isVerifyingPin, setIsVerifyingPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const pinInputRef = useRef(null);

  // Focus PIN input when locked
  useEffect(() => {
    if (isLocked) {
      setUnlockPin('');
      setPinError('');
      const timer = setTimeout(() => {
        pinInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLocked]);

  const handleUnlockSession = async (e) => {
    e?.preventDefault();
    if (!unlockPin || unlockPin.length < 4) {
      setPinError('Please enter your Master PIN.');
      return;
    }

    setIsVerifyingPin(true);
    setPinError('');

    try {
      await api.post('/auth/verify-pin', { pin: unlockPin });
      unlock();
      setUnlockPin('');
      setPinError('');
      addToast('Vault unlocked. Welcome back!', 'success');
    } catch (err) {
      console.error('Failed to unlock session:', err);
      setPinError(err.response?.data?.error || 'Incorrect Master PIN. Please try again.');
      setUnlockPin('');
      pinInputRef.current?.focus();
    } finally {
      setIsVerifyingPin(false);
    }
  };

  useEffect(() => {
    const updateProfileData = () => {
      const storedUserData = localStorage.getItem('user') || sessionStorage.getItem('user'); 
      
      if (storedUserData) {
        try {
          const parsedUser = JSON.parse(storedUserData);
          const displayName = parsedUser.name || parsedUser.email || 'User'; 
          
          setUserName(displayName);
          
          const words = displayName.trim().split(/\s+/);
          if (words.length === 1) {
            setUserInitials(words[0].substring(0, 2).toUpperCase());
          } else {
            setUserInitials((words[0][0] + words[1][0]).toUpperCase());
          }
        } catch (e) {
          console.error('Failed to parse user data', e);
        }
      }
    };

    updateProfileData();
    window.addEventListener('storage', updateProfileData);
    return () => window.removeEventListener('storage', updateProfileData);
  }, []);

  // ─── Global Ctrl+F / Cmd+F focuses dashboard search bar when NO document is open ───
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isLocked) return; // Ignore while locked
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        // If a document detail view is open, let the in-document search handle Ctrl+F
        if (!isDocumentOpen) {
          e.preventDefault();
          searchRef.current?.focus();
          searchRef.current?.select();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDocumentOpen, isLocked]);

  const navItems = [
    { id: 'dashboard', icon: FileText, label: 'My Documents' },
    { id: 'shared', icon: Share2, label: 'Shared With Me' },
    { id: 'recent', icon: Clock, label: 'Recent' }, 
    { id: 'audit', icon: Activity, label: 'Audit Log' },
    { id: 'verify', icon: ShieldCheck, label: 'Verify Signature' },
    { id: 'bin', icon: Trash2, label: 'Bin' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ]; 

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 font-sans">
      
      {/* ─── Main Dashboard Container with Conditional Strong Blur when Locked ─── */}
      <div 
        className={`flex h-full w-full bg-slate-950 text-slate-50 transition-all duration-300 ${
          isLocked 
            ? 'filter blur-xl scale-[0.99] pointer-events-none select-none opacity-40' 
            : 'filter-none scale-100 opacity-100'
        }`}
        aria-hidden={isLocked}
      >
        
        {/* Sidebar */}
        <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col flex-shrink-0 shadow-2xl">
          <div className="h-16 flex items-center px-6 border-b border-slate-800 text-white font-bold text-xl tracking-tight">
            <ShieldCheck className="w-6 h-6 text-emerald-500 mr-2" />
            SecureVault
          </div>
          
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setView(item.id);
                }}
                className={`w-full flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  currentView === item.id 
                    ? 'bg-emerald-500/10 text-emerald-400' 
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                {item.label}
              </button>
            ))}
          </nav>
          
          {/* Dynamic User Profile Footer */}
          <div className="p-4 border-t border-slate-800">
            <div className="flex items-center w-full px-3 py-2 rounded-lg bg-slate-950/50 border border-slate-800">
              <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold mr-3 flex-shrink-0 shadow-inner">
                {userInitials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{userName}</p>
                <p className="text-xs text-emerald-400 truncate">SecureVault User</p>
              </div>
              <button onClick={onLogout} className="p-1 text-slate-400 hover:text-red-400 transition-colors ml-2" title="Logout">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          
          <header className="h-16 bg-slate-900/60 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0 z-10">
            <div className="flex-1 max-w-md relative">
              <Search className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input 
                ref={searchRef}
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search folders, documents, or hashes... (Ctrl+F)" 
                className="w-full pl-10 pr-10 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-sm shadow-inner"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')} 
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  title="Clear search"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              )}
            </div>
            
            <div className="flex items-center space-x-3 ml-4">
              <Button variant="outline" icon={FolderPlus} onClick={() => setView('createFolderModal')} className="hidden sm:flex">
                New Folder
              </Button>
   
              <Button variant="primary" icon={UploadCloud} onClick={() => setView('uploadModal')} className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20">
                Upload
              </Button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-6 bg-slate-950">
            {children}
          </main>
        </div>
      </div>

      {/* ─── INACTIVITY AUTO-LOCK MODAL OVERLAY ─────────────────────────────────── */}
      {isLocked && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-2xl p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 text-center relative overflow-hidden animate-in zoom-in-95 duration-200">
            
            {/* Ambient Background Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Lock Icon */}
            <div className="relative mx-auto w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-5 shadow-lg shadow-emerald-950/50">
              <Lock className="w-8 h-8" />
              <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-emerald-500/20 animate-pulse" />
            </div>

            {/* Title & Subtitle */}
            <h3 className="text-xl font-bold text-slate-100 tracking-tight mb-2">
              Vault Auto-Locked
            </h3>
            <p className="text-xs sm:text-sm text-slate-400 leading-relaxed mb-6">
              Your session was secured after 5 minutes of inactivity. Re-enter your Master PIN to unlock your vault and resume your work.
            </p>

            {/* PIN Unlock Form */}
            <form onSubmit={handleUnlockSession} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 text-center">
                  Master PIN
                </label>
                <div className="relative max-w-xs mx-auto">
                  <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    ref={pinInputRef}
                    type="password"
                    maxLength={6}
                    autoComplete="off"
                    value={unlockPin}
                    onChange={(e) => {
                      setUnlockPin(e.target.value.replace(/\D/g, ''));
                      if (pinError) setPinError('');
                    }}
                    placeholder="••••••"
                    className={`w-full bg-slate-950 border ${
                      pinError ? 'border-red-500 focus:ring-red-500' : 'border-slate-700 focus:ring-emerald-500'
                    } text-slate-100 rounded-xl pl-10 pr-4 py-2.5 text-center text-lg tracking-[0.3em] font-mono placeholder-slate-600 focus:outline-none focus:ring-2 focus:border-transparent transition-all shadow-inner`}
                    disabled={isVerifyingPin}
                  />
                </div>
                {pinError && (
                  <div className="flex items-center justify-center space-x-1.5 mt-2 text-red-400 text-xs text-center">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>{pinError}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-2.5 max-w-xs mx-auto">
                <Button
                  type="submit"
                  variant="primary"
                  icon={isVerifyingPin ? Loader2 : Key}
                  disabled={isVerifyingPin || !unlockPin}
                  className={`w-full py-2.5 text-sm bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-950/50 ${
                    isVerifyingPin ? '[&_svg]:animate-spin' : ''
                  }`}
                >
                  {isVerifyingPin ? 'Unlocking...' : 'Unlock Vault'}
                </Button>
              </div>
            </form>

            {/* Logout Alternative */}
            <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-center">
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center text-xs text-slate-500 hover:text-red-400 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5 mr-1.5" />
                Sign out of this session
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default DashboardLayout;