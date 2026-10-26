import React, { useState, useRef } from 'react';
import { ShieldCheck, UploadCloud, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '../components/SharedUI';
import api from '../api/axiosConfig';

const VerifyPage = () => {
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null); 
  const [errorData, setErrorData] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setVerifying(true);
    setResult(null);
    setErrorData(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // 🚀 Hitting the new public verification route
      const response = await api.post('/documents/verify-public', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      setResult(response.data);
    } catch (error) {
      setResult('invalid');
      setErrorData({
        message: error.response?.data?.error || "Verification failed.",
        hash: error.response?.data?.currentHash || "Unknown"
      });
    } finally {
      setVerifying(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 text-center">
        <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-100">Verify Digital Signature</h2>
        <p className="text-slate-400 mt-2">Upload a signed document to mathematically verify its authenticity and check for tampering.</p>
      </div>

      <div className="bg-slate-900 p-8 rounded-xl shadow-sm border border-slate-800 text-center mb-8 relative">
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileUpload} 
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
          disabled={verifying}
        />
        <UploadCloud className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <Button variant="outline" disabled={verifying} className="relative z-0">
          {verifying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin inline" /> Verifying Cryptographic Hash...</> : 'Select Signed File to Verify'}
        </Button>
      </div>

      {result && result.isValid && (
        <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-6 flex items-start animate-in fade-in zoom-in">
          <CheckCircle className="w-8 h-8 text-emerald-400 mr-4 flex-shrink-0" />
          <div className="w-full">
            <h3 className="text-lg font-bold text-emerald-400">Signature Valid</h3>
            <p className="text-emerald-300/80 mt-1">The document matches the cryptographic signature and has not been altered.</p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm bg-slate-950/50 p-4 rounded-lg border border-emerald-500/20">
              <div>
                <span className="block text-slate-400 mb-1">Signer</span>
                <span className="font-semibold text-slate-200 block">{result.signerName}</span>
                <span className="text-xs text-slate-400 block">{result.signerEmail}</span>
              </div>
              <div><span className="block text-slate-400 mb-1">Timestamp</span><span className="font-semibold text-slate-200">{new Date(result.signedAt).toLocaleString()}</span></div>
              <div className="col-span-2">
                <span className="block text-slate-400 mb-1">Computed Hash (SHA-256)</span>
                <span className="font-mono text-xs bg-slate-900 px-2 py-1 rounded block break-all text-slate-400 border border-slate-800">{result.fileHash}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {result === 'invalid' && errorData && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6 flex items-start animate-in fade-in zoom-in">
          <AlertTriangle className="w-8 h-8 text-red-400 mr-4 flex-shrink-0" />
          <div className="w-full">
            <h3 className="text-lg font-bold text-red-400">Verification Failed</h3>
            <p className="text-red-300/80 mt-1">{errorData.message}</p>
            <div className="mt-4 text-sm bg-slate-950/50 p-4 rounded-lg border border-red-500/20 space-y-3">
              <div>
                <span className="block text-slate-400 mb-1 text-xs uppercase">Current File Hash</span>
                <span className="font-mono text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded block break-all">{errorData.hash}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VerifyPage;