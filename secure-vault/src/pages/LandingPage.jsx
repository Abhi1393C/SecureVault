import React, { useState, useRef } from 'react';
import { 
  ShieldCheck, Lock, PenTool, Users, Activity, 
  KeyRound, FileCode2, Database, ChevronRight,
  UploadCloud, Fingerprint, Share2, HelpCircle,
  CheckCircle, AlertTriangle, Loader2
} from 'lucide-react'; 
import { Button, Modal } from '../components/SharedUI';
import api from '../api/axiosConfig';

const LandingPage = ({ navigate }) => {
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState(null);
  const fileInputRef = useRef(null);

  const handlePublicVerify = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setVerifying(true);
    setVerifyResult(null);
    setVerifyError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await api.post('/documents/verify-public', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setVerifyResult(response.data);
    } catch (error) {
      setVerifyResult('invalid');
      setVerifyError({
        message: error.response?.data?.error || "Verification failed.",
        hash: error.response?.data?.currentHash || "Unknown"
      });
    } finally {
      setVerifying(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col font-sans selection:bg-emerald-500/30">
      
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-4 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-8 h-8 text-emerald-500" />
          <span className="text-xl font-bold tracking-tight text-white">SecureVault</span>
        </div>
        <div className="space-x-4">
          <Button variant="ghost" className="text-slate-300 hover:text-white" onClick={() => navigate('login')}>Login</Button>
          <Button variant="primary" className="bg-emerald-600 hover:bg-emerald-500" onClick={() => navigate('register')}>Get Started</Button>
        </div>
      </nav>

      {/* 1. Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 text-center pt-24 pb-20">
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight max-w-4xl mb-6 leading-tight text-white">
          Zero-Trust Document Management for <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-indigo-400">Modern Teams</span>
        </h1>
        
        <p className="mt-4 text-xl text-slate-400 max-w-2xl mb-12">
          Store sensitive files with AES-256-GCM encryption, apply cryptographic digital signatures, and track every action with a tamper-evident audit log.
        </p>
        
        <div className="flex sm:flex-row flex-col items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4 w-full">
          <Button variant="primary" className="text-base px-6 py-3 bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 flex items-center justify-center w-full sm:w-auto" onClick={() => navigate('register')}>
            Start Securing Documents <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
          <Button variant="outline" className="text-base px-6 py-3 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white w-full sm:w-auto" onClick={() => navigate('login')}>
            Sign In to Vault
          </Button>
          {/* New Verify Button */}
          <Button variant="outline" className="text-base px-6 py-3 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 hover:border-indigo-500/50 w-full sm:w-auto" onClick={() => { setIsVerifyOpen(true); setVerifyResult(null); }}>
            <FileCode2 className="w-4 h-4 mr-2" /> Verify a Document
          </Button>
        </div>

        {/* 2. Feature Grid */}
        <div className="mt-32 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto px-4 w-full">
          {[
            { icon: Lock, title: "Encrypted Storage", desc: "Dual-mode AES-256-GCM storage. Choose standard or PIN-protected encrypted mode per file." },
            { icon: PenTool, title: "Digital Signing", desc: "Cryptographic Ed25519 signatures ensuring absolute non-repudiation, not just image overlays." }, 
            { icon: Users, title: "Role-Based Access", desc: "Strictly enforced Owner, Editor, and Viewer roles to prevent unauthorized modifications." },
            { icon: Activity, title: "Tamper-Evident Logs", desc: "Hash-chained audit trails guarantee the integrity of your document history." }
          ].map((feature, idx) => (
            <div key={idx} className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 text-left hover:border-emerald-500/50 hover:bg-slate-900 transition-all duration-300 group">
              <div className="w-12 h-12 bg-slate-800 rounded-lg flex items-center justify-center mb-4 text-emerald-400 border border-slate-700 group-hover:scale-110 transition-transform">
                <feature.icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-slate-400 leading-relaxed text-sm">{feature.desc}</p>
            </div>
          ))}
        </div>

        {/* 3. NEW SECTION: How It Works */}
        <div className="mt-40 w-full max-w-7xl mx-auto px-4 text-left">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">How SecureVault Protects You</h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">A seamless workflow that prioritizes your privacy at every single step.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800">
              <UploadCloud className="w-10 h-10 text-emerald-500 mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">1. Local Processing</h3>
              <p className="text-slate-400">When you select a file, it never leaves your browser raw. We process and prepare the document entirely on your local machine.</p>
            </div>
            <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800">
              <Fingerprint className="w-10 h-10 text-emerald-500 mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">2. Encrypt & Sign</h3>
              <p className="text-slate-400">The file is locked using AES-256-GCM. If you choose to sign it, your unique cryptographic signature is attached permanently.</p>
            </div>
            <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800">
              <Share2 className="w-10 h-10 text-emerald-500 mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">3. Zero-Trust Storage</h3>
              <p className="text-slate-400">The encrypted file is sent to our servers. We cannot read your files, meaning total privacy and immunity from data breaches.</p>
            </div>
          </div>
        </div>

        {/* 4. Architecture (Humanized) */}
        <div className="mt-40 w-full max-w-7xl mx-auto px-4 text-left">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Bank-Grade Security, Made Simple</h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">You don't need a PhD in cryptography to stay safe. We handle the complex math behind the scenes so you can focus on your work.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            <div className="hidden md:block absolute top-12 left-24 right-24 h-0.5 bg-gradient-to-r from-slate-800 via-emerald-900/50 to-slate-800 z-0"></div>
            
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 border-4 border-slate-950 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                <KeyRound className="w-10 h-10 text-emerald-400" />
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Smart PIN Protection</h4>
              <span className="text-xs font-mono bg-slate-800 text-emerald-400 px-2 py-1 rounded mb-3">Powered by Argon2id</span>
              <p className="text-slate-400 text-sm">We mathematically stretch your simple 6-digit PIN into a massive, uncrackable lock, keeping brute-force hackers completely shut out.</p>
            </div>

            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 border-4 border-slate-950 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                <Database className="w-10 h-10 text-emerald-400" />
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Ironclad File Storage</h4>
              <span className="text-xs font-mono bg-slate-800 text-emerald-400 px-2 py-1 rounded mb-3">AES-256-GCM Encryption</span>
              <p className="text-slate-400 text-sm">Documents are scrambled before they ever leave your device. Even if our servers are breached, all anyone sees is useless gibberish.</p>
            </div>

            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 bg-slate-900 rounded-full flex items-center justify-center mb-6 border-4 border-slate-950 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                <FileCode2 className="w-10 h-10 text-emerald-400" />
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Tamper-Proof Seals</h4>
              <span className="text-xs font-mono bg-slate-800 text-emerald-400 px-2 py-1 rounded mb-3">Ed25519 Signatures</span>
              <p className="text-slate-400 text-sm">Every file gets an invisible, mathematical fingerprint. This proves your document is 100% authentic and hasn't been altered by anyone.</p>
            </div>
          </div>
        </div>

        {/* 5. NEW SECTION: FAQ */}
        <div className="mt-40 w-full max-w-4xl mx-auto px-4 text-left">
          <div className="flex items-center justify-center space-x-3 mb-10">
            <HelpCircle className="w-8 h-8 text-emerald-500" />
            <h2 className="text-3xl md:text-4xl font-bold text-white text-center">Frequently Asked Questions</h2>
          </div>
          
          <div className="space-y-4">
            {[
              { q: "Can system administrators read my documents?", a: "No. SecureVault uses a Zero-Knowledge architecture. Your files are encrypted on your device before they reach our database. We do not have the keys to decrypt your data." },
              { q: "What happens if I forget my 6-Digit Master PIN?", a: "Because we do not store your PIN, it cannot be recovered. Your PIN is the mathematical basis for your encryption keys. Losing it means losing access to your securely signed files." },
              { q: "Is the digital signature legally binding?", a: "SecureVault uses cryptographic Ed25519 signatures which provide mathematically irrefutable proof of document origin and integrity, meeting strict digital compliance standards." }
            ].map((faq, idx) => (
              <div key={idx} className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
                <h4 className="text-lg font-semibold text-white mb-2">{faq.q}</h4>
                <p className="text-slate-400 text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 6. CTA Bottom */}
        <div className="mt-40 mb-10 w-full max-w-5xl mx-auto px-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-10 md:p-16 text-center border border-slate-700/50 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-indigo-500"></div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Ready to secure your workflow?</h2>
            <p className="text-slate-400 text-lg mb-10 max-w-2xl mx-auto">
              Join the prototype phase and experience true zero-knowledge document sharing today.
            </p>
            <button 
              onClick={() => navigate('register')}
              className="text-lg font-semibold px-10 py-4 rounded-lg bg-white text-slate-900 hover:bg-slate-200 transition-colors shadow-lg"
            >
              Create Your Free Vault
            </button>
          </div>
        </div>
        
      </main>
      
      {/* Footer */}
      <footer className="border-t border-slate-800 py-8 text-center text-slate-500 text-sm bg-slate-950">
        <p>© {new Date().getFullYear()} SecureVault Prototype. Built for academic purposes.</p>
      </footer>

      {/* Public Verification Modal */}
      <Modal isOpen={isVerifyOpen} onClose={() => setIsVerifyOpen(false)} title="Verify Digital Signature" maxWidth="max-w-2xl">
        <div className="space-y-6">
          <p className="text-sm text-slate-400 text-center">
            Upload a document to mathematically verify its origin and check if it has been tampered with since signing. No account required.
          </p>

          <div className="bg-slate-950 p-8 rounded-xl border border-slate-800 text-center relative hover:border-emerald-500/50 transition-colors">
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handlePublicVerify} 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
              disabled={verifying}
            />
            <UploadCloud className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <Button variant="outline" disabled={verifying} className="relative z-0 pointer-events-none">
              {verifying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Analyzing Cryptography...</> : 'Select File to Verify'}
            </Button>
          </div>

          {verifyResult && verifyResult.isValid && (
            <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-5 flex items-start animate-in fade-in zoom-in text-left">
              <CheckCircle className="w-6 h-6 text-emerald-400 mr-3 flex-shrink-0 mt-0.5" />
              <div className="w-full min-w-0">
                <h3 className="text-base font-bold text-emerald-400">Signature Authentic</h3>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm bg-slate-950/50 p-3 rounded-lg border border-emerald-500/20">
                  <div>
                    <span className="block text-slate-500 text-xs mb-0.5 uppercase">Signer</span>
                    <span className="font-medium text-slate-200 truncate block">{verifyResult.signerName}</span>
                    <span className="text-xs text-slate-400 truncate block">{verifyResult.signerEmail}</span>
                  </div>
                  <div><span className="block text-slate-500 text-xs mb-0.5 uppercase">Date</span><span className="font-medium text-slate-200 truncate block">{new Date(verifyResult.signedAt).toLocaleDateString()}</span></div>
                  <div className="col-span-2">
                    <span className="block text-slate-500 text-xs mb-0.5 uppercase">Document Hash</span>
                    <span className="font-mono text-xs text-slate-400 truncate block">{verifyResult.fileHash}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {verifyResult === 'invalid' && verifyError && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-5 flex items-start animate-in fade-in zoom-in text-left">
              <AlertTriangle className="w-6 h-6 text-red-400 mr-3 flex-shrink-0 mt-0.5" />
              <div className="w-full min-w-0">
                <h3 className="text-base font-bold text-red-400">Tampering Detected</h3>
                <p className="text-red-300/80 mt-1 text-sm">{verifyError.message}</p>
                <div className="mt-3 text-sm bg-slate-950/50 p-3 rounded-lg border border-red-500/20 space-y-2">
                  <div>
                    <span className="block text-slate-500 text-xs mb-0.5 uppercase">Current File Hash</span>
                    <span className="font-mono text-xs text-red-400 truncate block">{verifyError.hash}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

    </div>
  );
};

export default LandingPage;