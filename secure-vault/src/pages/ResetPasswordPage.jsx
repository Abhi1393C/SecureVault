import React, { useState } from 'react';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react'; 
import { Button } from '../components/SharedUI';
import api from '../api/axiosConfig';

const PasswordInput = ({ label, name, value, showState, toggleFunc, placeholder, onChange }) => (
  <div className="space-y-1">
    <label className="block text-sm font-medium text-slate-300">{label}</label>
    <div className="relative mt-1">
      <input 
        type={showState ? "text" : "password"} 
        name={name}
        value={value}
        onChange={onChange}
        required 
        placeholder={placeholder}
        className="block w-full rounded-lg border border-slate-700 px-3 py-2 shadow-sm bg-slate-950 text-white placeholder-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-emerald-500 sm:text-sm pr-10" 
      />
      <button 
        type="button"
        onClick={() => toggleFunc(!showState)}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-emerald-400"
      >
        {showState ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  </div>
);

const ResetPasswordPage = ({ token, navigate }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [strength, setStrength] = useState(0);
  
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    const calculatedStrength = Math.min(100, (e.target.value.length / 12) * 100);
    setStrength(calculatedStrength);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (password !== confirmPassword) {
      setError("Passwords do not match!");
      return;
    }

    const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_-])[A-Za-z\d@$!%*?&#^_-]{12,}$/;
    if (!passRegex.test(password)) {
      setError("Password must be 12+ chars, including uppercase, lowercase, numbers, and symbols.");
      return;
    }

    setLoading(true);
    try {
      // Backend ko token aur naya password bhej rahe hain
      await api.post('/auth/reset-password', { token, newPassword: password });
      setSuccessMsg("Password reset successfully! Redirecting to login...");
      
      setTimeout(() => navigate('login'), 1000);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to reset password. Link might be expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans selection:bg-emerald-500/30 text-slate-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto" />
        <h2 className="mt-4 text-3xl font-extrabold text-white">Create New Password</h2>
        <p className="mt-2 text-sm text-slate-400">Your Master PIN remains unchanged.</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900/80 backdrop-blur-md py-8 px-4 shadow-2xl border border-slate-800 sm:rounded-2xl sm:px-10">
          
          {error && <div className="mb-4 p-3 bg-red-900/30 border-l-4 border-red-500 text-red-300 text-sm rounded">{error}</div>}
          {successMsg && <div className="mb-4 p-3 bg-emerald-900/30 border-l-4 border-emerald-500 text-emerald-300 text-sm rounded">{successMsg}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <PasswordInput 
              label="New Password" 
              name="password" 
              value={password} 
              onChange={handlePasswordChange} 
              showState={showPassword} 
              toggleFunc={setShowPassword} 
            />

            <div className="mt-3 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className={`h-full transition-all duration-300 ${strength < 30 ? 'bg-red-500' : strength < 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${strength}%` }} />
            </div>

            <PasswordInput 
              label="Confirm New Password" 
              name="confirmPassword" 
              value={confirmPassword} 
              onChange={(e) => setConfirmPassword(e.target.value)} 
              showState={showConfirmPassword} 
              toggleFunc={setShowConfirmPassword} 
            />

            <Button variant="primary" type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white mt-6 py-2.5" isLoading={loading}>
              Reset Password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordPage;