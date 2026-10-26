import React, { useState, useEffect } from 'react';
import { Key, AlertCircle, CheckCircle, Loader, User, Shield, Lock, Mail, AlertTriangle, HardDrive } from 'lucide-react';
import { Button, Badge, Modal } from '../components/SharedUI';
import api from '../api/axiosConfig';
import { useToast } from '../components/ToastContext';

const STORAGE_LIMIT_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB

const formatBytes = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const SettingsPage = () => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('profile');

  const [formData, setFormData] = useState({
    name: '',
    email: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [isResetLinkLoading, setIsResetLinkLoading] = useState(false);

  // Storage Quota State (Feature 6)
  const [usedStorage, setUsedStorage] = useState(0);

  // Reset Master PIN State
  const [isResetPinModalOpen, setIsResetPinModalOpen] = useState(false);
  const [resetPinForm, setResetPinForm] = useState({ password: '', newPin: '', confirmPin: '' });
  const [isResettingPin, setIsResettingPin] = useState(false);

  // Helper function for dynamic initials (Case sensitive)
  const getInitials = (fullName) => {
    if (!fullName || !fullName.trim()) return 'AM';
    const words = fullName.trim().split(/\s+/);
    if (words.length === 1) {
      return words[0].charAt(0);
    } else {
      return words[0].charAt(0) + words[1].charAt(0);
    }
  };

  // 1. Update the useEffect block
  useEffect(() => {
    const loadProfile = async () => {
      try {
        let name = '';
        let email = '';

        // 🚀 FIX: Check both localStorage and sessionStorage
        const storedUserData = localStorage.getItem('user') || sessionStorage.getItem('user');
        if (storedUserData) {
          const parsed = JSON.parse(storedUserData);
          name = parsed.name || parsed.fullName || parsed.username || '';
          email = parsed.email || '';
        }

        if (!email || !name) {
          const token = localStorage.getItem('token') || sessionStorage.getItem('token');
          if (token) {
            try {
              const base64Url = token.split('.')[1];
              const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
              const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
              const decodedToken = JSON.parse(jsonPayload);
              
              email = email || decodedToken.email || decodedToken.sub || '';
              name = name || decodedToken.name || decodedToken.fullName || decodedToken.username || '';
            } catch (jwtErr) {
              console.error("Could not parse JWT token", jwtErr);
            }
          }
        }

        setFormData({ name, email });

        // 🚀 Feature 6: Fetch live usedStorage from backend
        try {
          const profileRes = await api.get('/auth/profile');
          if (profileRes.data.usedStorage !== undefined) {
            setUsedStorage(profileRes.data.usedStorage);
          }
        } catch (storageErr) {
          console.warn("Could not fetch storage usage:", storageErr);
        }
      } catch (e) {
        console.error("Failed to load user profile", e);
      } finally {
        setIsFetching(false);
      }
    };

    loadProfile();
  }, []);

  // 2. Update the handleSaveProfile function
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await api.put('/auth/profile', { name: formData.name });

      // 🚀 FIX: Update the correct active storage (session or local)
      const storage = localStorage.getItem('user') ? localStorage : sessionStorage;
      const storedUserData = JSON.parse(storage.getItem('user') || '{}');
      const updatedUser = { ...storedUserData, name: formData.name, email: formData.email };
      storage.setItem('user', JSON.stringify(updatedUser));

      window.dispatchEvent(new Event('storage'));

      addToast("Profile updated successfully!", "success");
    } catch (error) {
      console.error("Profile update error:", error);
      addToast(error.response?.data?.error || "Failed to update profile.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Naya function: Sirf email bhejkar reset link trigger karna
  const handleSendResetLink = async () => {
    setIsResetLinkLoading(true);
    try {
      // Tumhara existing forgot password route use kar rahe hain
      await api.post('/auth/forgot-password', { email: formData.email });
      addToast("Password reset link sent to your email!", "success");
    } catch (error) {
      console.error("Send reset link error:", error);
      addToast(error.response?.data?.error || "Failed to send reset link.", "error");
    } finally {
      setIsResetLinkLoading(false);
    }
  };

  const handleResetPin = async (e) => {
    e.preventDefault();
    if (!resetPinForm.password) {
      addToast("Please enter your account password to confirm.", "error");
      return;
    }
    if (!/^\d{6}$/.test(resetPinForm.newPin)) {
      addToast("New Master PIN must be exactly 6 numeric digits.", "error");
      return;
    }
    if (resetPinForm.newPin !== resetPinForm.confirmPin) {
      addToast("Master PINs do not match.", "error");
      return;
    }

    setIsResettingPin(true);
    try {
      const response = await api.post('/auth/reset-pin', {
        password: resetPinForm.password,
        newPin: resetPinForm.newPin
      });

      addToast(response.data.message || "Master PIN reset successfully. All previous data was purged.", "success");
      setIsResetPinModalOpen(false);
      setResetPinForm({ password: '', newPin: '', confirmPin: '' });
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error("Reset PIN error:", error);
      addToast(error.response?.data?.error || "Failed to reset Master PIN. Check your password.", "error");
    } finally {
      setIsResettingPin(false);
    }
  };

  if (isFetching) {
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center py-28 text-slate-400">
        <Loader className="w-6 h-6 animate-spin mr-3 text-emerald-500" /> Loading account settings...
      </div>
    );
  }

  const currentInitials = getInitials(formData.name);
  const displayName = formData.name.trim() || 'User';

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">Account Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Manage your secure identity, encryption preferences, and access permissions.</p>
      </div>
      
      <div className="bg-slate-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-800/80 overflow-hidden flex flex-col md:flex-row min-h-[560px]">
        
        <div className="w-full md:w-72 bg-slate-950/60 border-r border-slate-800/80 p-4 space-y-2 flex-shrink-0">
          <button 
            onClick={() => setActiveTab('profile')} 
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
              activeTab === 'profile' 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm' 
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Profile & Account</span>
          </button>

          <button 
            onClick={() => setActiveTab('security')} 
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
              activeTab === 'security' 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm' 
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Security & PIN</span>
          </button>

          <button 
            onClick={() => setActiveTab('roles')} 
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
              activeTab === 'roles' 
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm' 
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Roles & Access</span>
          </button>
        </div>
        
        <div className="p-8 md:p-10 flex-1 bg-slate-900/40">
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-8">
              <div className="border-b border-slate-800/80 pb-4">
                <h3 className="text-lg font-semibold text-slate-100">Profile Information</h3>
                <p className="text-xs text-slate-400 mt-0.5">Your personal identity details across SecureVault.</p>
              </div>
              
              <div className="p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80 max-w-lg flex items-center space-x-6">
                <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-2xl flex items-center justify-center text-white text-2xl font-bold tracking-wider shadow-lg shadow-emerald-950/50 ring-2 ring-emerald-500/30 flex-shrink-0">
                  {currentInitials}
                </div>
                <div className="min-w-0">
                  <h4 className="text-base font-semibold text-slate-100 truncate">{displayName}</h4>
                  <p className="text-[11px] text-slate-400 mt-1">Automatically derived from your full name (Case sensitive).</p>
                </div>
              </div>

              <div className="space-y-5 max-w-lg">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input 
                      type="text" 
                      value={formData.name} 
                      placeholder="Enter your full name"
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-slate-950/80 border border-slate-800 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all" 
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                    Email Address <span className="text-emerald-400/80 normal-case font-normal">(Verified)</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    <input 
                      type="email" 
                      value={formData.email} 
                      disabled 
                      className="w-full border border-slate-800/80 bg-slate-950/40 text-slate-400 rounded-xl pl-10 pr-10 py-2.5 text-sm cursor-not-allowed select-none" 
                    />
                    <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5">Primary email address is bound to your account and cannot be modified.</p>
                </div>

                <div className="pt-2">
                  <Button 
                    type="submit" 
                    variant="primary" 
                    disabled={isLoading}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-xl font-medium shadow-lg shadow-emerald-950/55 transition-all"
                  >
                    {isLoading ? 'Saving Changes...' : 'Save Profile'}
                  </Button>
                </div>
              </div>

              {/* ─── Feature 6: Storage Quota Progress Bar ─────────────────────── */}
              <div className="mt-8 p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80 max-w-lg space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center space-x-2">
                    <HardDrive className="w-4 h-4 text-slate-400" />
                    <h4 className="text-sm font-medium text-slate-200">Storage Usage</h4>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {formatBytes(usedStorage)} / {formatBytes(STORAGE_LIMIT_BYTES)}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-500 ${
                      usedStorage / STORAGE_LIMIT_BYTES >= 0.95
                        ? 'bg-red-500'
                        : usedStorage / STORAGE_LIMIT_BYTES >= 0.80
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, (usedStorage / STORAGE_LIMIT_BYTES) * 100).toFixed(1)}%` }}
                  />
                </div>

                <p className="text-[11px] text-slate-500">
                  {((usedStorage / STORAGE_LIMIT_BYTES) * 100).toFixed(1)}% used
                  {usedStorage / STORAGE_LIMIT_BYTES >= 0.95 && (
                    <span className="ml-2 text-red-400 font-medium">⚠ Storage almost full</span>
                  )}
                  {usedStorage / STORAGE_LIMIT_BYTES >= 0.80 && usedStorage / STORAGE_LIMIT_BYTES < 0.95 && (
                    <span className="ml-2 text-amber-400 font-medium">Storage running low</span>
                  )}
                </p>
              </div>
            </form>
          )}

          {activeTab === 'security' && (
            <div className="space-y-8">
              <div className="border-b border-slate-800/80 pb-4">
                <h3 className="text-lg font-semibold text-slate-100">Security & Credentials</h3>
                <p className="text-xs text-slate-400 mt-0.5">Manage your account password, master PIN, and active sessions.</p>
              </div>

              <div className="space-y-6 max-w-lg">
                
                {/* Simplified Reset Password Card */}
                <div className="p-5 rounded-2xl bg-slate-950/50 border border-slate-800/80 space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-slate-200 mb-1">Reset Account Password</h4>
                    <p className="text-xs text-slate-400">Click the button below to receive a secure password reset link on your registered email address.</p>
                  </div>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleSendResetLink}
                    disabled={isResetLinkLoading}
                    className="w-full rounded-xl border-slate-700 hover:bg-slate-800 text-xs py-2"
                  >
                    {isResetLinkLoading ? 'Sending Email...' : 'Send Password Reset Link'}
                  </Button>
                </div>

                <div className="p-5 rounded-2xl bg-slate-950/50 border border-slate-800/80">
                  <h4 className="text-sm font-medium text-slate-200 mb-1">Vault Master PIN</h4>
                  <p className="text-xs text-slate-400 mb-4">Your PIN unlocks your private key locally in browser memory for end-to-end security.</p>
                  <div>
                    <Button 
                      variant="danger" 
                      icon={AlertCircle} 
                      onClick={() => setIsResetPinModalOpen(true)} 
                      className="rounded-xl text-xs py-2 px-4 shadow-lg shadow-red-950/50"
                    >
                      Reset PIN (Data Loss)
                    </Button>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-slate-200 mb-3">Active Session</h4>
                  <div className="border border-slate-800/80 rounded-2xl divide-y divide-slate-800/80 text-sm bg-slate-950/30 overflow-hidden">
                    <div className="p-4 flex justify-between items-center">
                      <div className="flex items-center space-x-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
                        <div>
                          <p className="font-medium text-slate-200 text-xs">Current Browser Session</p>
                          <p className="text-slate-500 text-[11px]">Encrypted Web Storage Active</p>
                        </div>
                      </div>
                      <Badge variant="success" className="text-[10px]">Secure</Badge>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'roles' && (
            <div className="space-y-6">
              <div className="border-b border-slate-800/80 pb-4">
                <h3 className="text-lg font-semibold text-slate-100">Access Control & RBAC</h3>
                <p className="text-xs text-slate-400 mt-0.5">SecureVault implements zero-trust role-based permissions per document.</p>
              </div>
              
              <div className="border border-slate-800/80 rounded-2xl overflow-hidden text-xs bg-slate-950/40 shadow-inner">
                <table className="w-full text-left">
                  <thead className="bg-slate-950 border-b border-slate-800 text-slate-300 font-medium">
                    <tr>
                      <th className="px-4 py-3.5">Capability</th>
                      <th className="px-4 py-3.5 text-center">Viewer</th>
                      <th className="px-4 py-3.5 text-center">Editor</th>
                      <th className="px-4 py-3.5 text-center">Owner</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-400">
                    <tr><td className="px-4 py-3.5 font-medium text-slate-300">View Document</td><td className="text-center"><CheckCircle className="w-4 h-4 mx-auto text-emerald-500"/></td><td className="text-center"><CheckCircle className="w-4 h-4 mx-auto text-emerald-500"/></td><td className="text-center"><CheckCircle className="w-4 h-4 mx-auto text-emerald-500"/></td></tr>
                    <tr><td className="px-4 py-3.5 font-medium text-slate-300">Download PDF</td><td className="text-center"><CheckCircle className="w-4 h-4 mx-auto text-emerald-500"/></td><td className="text-center"><CheckCircle className="w-4 h-4 mx-auto text-emerald-500"/></td><td className="text-center"><CheckCircle className="w-4 h-4 mx-auto text-emerald-500"/></td></tr>
                    <tr><td className="px-4 py-3.5 font-medium text-slate-300">Apply Signature</td><td className="text-center text-slate-600">-</td><td className="text-center"><CheckCircle className="w-4 h-4 mx-auto text-emerald-500"/></td><td className="text-center"><CheckCircle className="w-4 h-4 mx-auto text-emerald-500"/></td></tr>
                    <tr><td className="px-4 py-3.5 font-medium text-slate-300">Share & Manage Roles</td><td className="text-center text-slate-600">-</td><td className="text-center text-slate-600">-</td><td className="text-center"><CheckCircle className="w-4 h-4 mx-auto text-emerald-500"/></td></tr>
                    <tr><td className="px-4 py-3.5 font-medium text-slate-300">Delete Document</td><td className="text-center text-slate-600">-</td><td className="text-center text-slate-600">-</td><td className="text-center"><CheckCircle className="w-4 h-4 mx-auto text-emerald-500"/></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RESET MASTER PIN MODAL */}
      <Modal 
        isOpen={isResetPinModalOpen} 
        onClose={() => !isResettingPin && setIsResetPinModalOpen(false)} 
        title="Reset Master PIN (Data Loss Warning)"
      >
        <form onSubmit={handleResetPin} className="space-y-4 text-left">
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs space-y-1.5">
            <div className="flex items-center space-x-2 text-red-400 font-semibold text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>IRREVERSIBLE ACTION — TOTAL DATA PURGE</span>
            </div>
            <p className="leading-relaxed text-red-200/90">
              Because SecureVault utilizes Zero-Knowledge encryption, your existing documents cannot be unlocked without your original PIN. Resetting your PIN will <strong className="text-white font-semibold">permanently purge all your current files, folders, and shared keys</strong>.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Account Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input 
                type="password" 
                required
                placeholder="Enter your account password"
                value={resetPinForm.password}
                onChange={(e) => setResetPinForm({ ...resetPinForm, password: e.target.value })}
                className="w-full bg-slate-950/80 border border-slate-800 text-white rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">New 6-Digit PIN</label>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                <input 
                  type="password" 
                  maxLength={6}
                  required
                  placeholder="6 digits"
                  value={resetPinForm.newPin}
                  onChange={(e) => setResetPinForm({ ...resetPinForm, newPin: e.target.value.replace(/\D/g, '') })}
                  className="w-full bg-slate-950/80 border border-slate-800 text-white rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all tracking-widest"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Confirm New PIN</label>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-400" />
                <input 
                  type="password" 
                  maxLength={6}
                  required
                  placeholder="6 digits"
                  value={resetPinForm.confirmPin}
                  onChange={(e) => setResetPinForm({ ...resetPinForm, confirmPin: e.target.value.replace(/\D/g, '') })}
                  className="w-full bg-slate-950/80 border border-slate-800 text-white rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-2 focus:ring-red-500/50 focus:border-red-500 outline-none transition-all tracking-widest"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex justify-end space-x-3">
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => setIsResetPinModalOpen(false)}
              disabled={isResettingPin}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="danger" 
              disabled={isResettingPin || !resetPinForm.password || resetPinForm.newPin.length < 6}
              className="text-xs bg-red-600 hover:bg-red-500"
            >
              {isResettingPin ? 'Purging & Resetting...' : 'I Understand, Reset PIN & Purge Data'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SettingsPage;