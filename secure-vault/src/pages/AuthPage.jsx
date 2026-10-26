import React, { useState, useEffect } from 'react';
// FIX 1: Added 'Lock' to the import list
import { ShieldCheck, Eye, EyeOff, MailCheck, Lock } from 'lucide-react'; 
import { Button } from '../components/SharedUI';
import api from '../api/axiosConfig';

// FIX 2: Updated PasswordInput for Dark Mode (bg-slate-950, text-white, border-slate-700)
const PasswordInput = ({ label, name, value, showState, toggleFunc, placeholder, maxLength, onChange }) => (
  <div className="space-y-1">
    <label className="block text-sm font-medium text-slate-300">{label}</label>
    <div className="relative mt-1">
      <input 
        type={showState ? "text" : "password"} 
        name={name}
        value={value}
        onChange={onChange}
        required 
        maxLength={maxLength}
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

const AuthPage = ({ type, navigate }) => {
  const isLogin = type === 'login';
  const isForgot = type === 'forgot';
  
  const [strength, setStrength] = useState(0);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [isVerifying, setIsVerifying] = useState(false);
  const [otp, setOtp] = useState('');
  const [timer, setTimer] = useState(0);
  const [rememberMe, setRememberMe] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    pin: ''
  });

  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (e.target.name === 'password') {
      const calculatedStrength = Math.min(100, (e.target.value.length / 12) * 100);
      setStrength(calculatedStrength);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    setError('');
    setSuccessMsg('');

    // FORGOT PASSWORD LOGIC (Presentation Ready)
    if (isForgot) {
      if (!formData.email) {
        setError("Please enter your email address.");
        return;
      }
      
      setLoading(true);
      try {
        // Backend ko request bhej rahe hain!
        const response = await api.post('/auth/forgot-password', {
          email: formData.email
        });
        
        setSuccessMsg(response.data.message || "Secure reset link has been sent to your email.");
        
        // 3 second baad user ko wapas login pe bhej do
        setTimeout(() => navigate('login'), 1000); 
      } catch (err) {
        setError(err.response?.data?.error || "Failed to process request. Please try again.");
      } finally {
        setLoading(false);
      }
      return; // Aage ka signup/login logic run mat karo
    }

    if (!isLogin && formData.password !== formData.confirmPassword) {
      setError("Passwords do not match!");
      return; 
    }

    if (!isLogin) {
      const passRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_-])[A-Za-z\d@$!%*?&#^_-]{12,}$/;
      if (!passRegex.test(formData.password)) {
        setError("Password must be 12+ chars, including uppercase, lowercase, numbers, and symbols.");
        return;
      }
    }

    setLoading(true);

    try {
      if (isLogin) {
        const response = await api.post('/auth/login', {
          email: formData.email,
          password: formData.password
        });
        
        // REMEMBER ME LOGIC: Select Storage Type
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem('token', response.data.token);
        storage.setItem('refreshToken', response.data.refreshToken);
        storage.setItem('user', JSON.stringify(response.data.user));
        
        navigate('dashboard');
      } else {
        await api.post('/auth/signup', {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          pin: formData.pin
        });
        
        setSuccessMsg('OTP sent to your email! Please verify to continue.');
        setIsVerifying(true);
        setTimer(120); 
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      await api.post('/auth/verify-otp', {
        email: formData.email,
        otp: otp
      });
      setSuccessMsg('Email verified & Account created successfully! Please sign in below.');
      setIsVerifying(false);
      navigate('login');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setError('');
    setSuccessMsg('');
    try {
      await api.post('/auth/resend-otp', { email: formData.email });
      setSuccessMsg('A new OTP has been sent to your email.');
      setTimer(120);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend OTP.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans selection:bg-emerald-500/30 text-slate-50">
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto" />
        <h2 className="mt-4 text-3xl font-extrabold text-white">
          {isVerifying ? 'Verify your email' : isForgot ? 'Reset Master PIN' : isLogin ? 'Sign in to your vault' : 'Create your secure vault'}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-900/80 backdrop-blur-md py-8 px-4 shadow-2xl border border-slate-800 sm:rounded-2xl sm:px-10">
          
          {error && <div className="mb-4 p-3 bg-red-900/30 border-l-4 border-red-500 text-red-300 text-sm rounded">{error}</div>}
          {successMsg && <div className="mb-4 p-3 bg-emerald-900/30 border-l-4 border-emerald-500 text-emerald-300 text-sm rounded">{successMsg}</div>}

          {isVerifying ? (
            <form onSubmit={handleVerifyOTP} className="space-y-6">
              <div className="text-center text-sm text-slate-400 mb-6">
                We've sent a 6-digit code to <br/>
                <strong className="text-white">{formData.email}</strong>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 text-center mb-2">Enter OTP</label>
                <input
                  type="text"
                  maxLength="6"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="appearance-none block w-full px-3 py-3 border border-slate-700 rounded-lg shadow-sm placeholder-slate-600 bg-slate-950 text-white text-center text-2xl tracking-widest focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>

              <Button variant="primary" type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3" isLoading={loading}>
                Verify OTP
              </Button>

              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={handleResendOTP}
                  disabled={timer > 0}
                  className={`text-sm font-medium transition-colors ${timer > 0 ? 'text-slate-600 cursor-not-allowed' : 'text-emerald-400 hover:text-emerald-300'}`}
                >
                  {timer > 0 ? `Resend OTP in ${timer}s` : 'Resend OTP'}
                </button>
              </div>
            </form>

          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              
              {!isLogin && !isForgot && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-slate-300">Full Name</label>
                  <input name="name" value={formData.name} onChange={handleChange} className="w-full px-3 py-2 border border-slate-700 rounded-lg bg-slate-950 text-white focus:ring-emerald-500 focus:border-emerald-500" required />
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-300">Email Address</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-3 py-2 border border-slate-700 rounded-lg bg-slate-950 text-white focus:ring-emerald-500 focus:border-emerald-500" required />
              </div>

              {!isForgot && (
                <>
                  <PasswordInput 
                    label="Password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    showState={showPassword}
                    toggleFunc={setShowPassword}
                  />
                  
                  {/* Password Checklist (Only for Signup) */}
                  {!isLogin && (
                    <div className="mt-2 text-xs bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                      <p className="font-semibold text-slate-300 mb-1">Password Requirements:</p>
                      <ul className="space-y-1">
                        <li className={formData.password.length >= 12 ? "text-emerald-400" : "text-slate-500"}>
                          {formData.password.length >= 12 ? "✓" : "○"} At least 12 characters
                        </li>
                        <li className={/[A-Z]/.test(formData.password) ? "text-emerald-400" : "text-slate-500"}>
                          {/[A-Z]/.test(formData.password) ? "✓" : "○"} One uppercase letter (A-Z)
                        </li>
                        <li className={/[a-z]/.test(formData.password) ? "text-emerald-400" : "text-slate-500"}>
                          {/[a-z]/.test(formData.password) ? "✓" : "○"} One lowercase letter (a-z)
                        </li>
                        <li className={/\d/.test(formData.password) ? "text-emerald-400" : "text-slate-500"}>
                          {/\d/.test(formData.password) ? "✓" : "○"} One number (0-9)
                        </li>
                        <li className={/[@$!%*?&#^_-]/.test(formData.password) ? "text-emerald-400" : "text-slate-500"}>
                          {/[@$!%*?&#^_-]/.test(formData.password) ? "✓" : "○"} One special character
                        </li>
                      </ul>
                    </div>
                  )}

                  {/* Strength Bar (Only for Signup) */}
                  {!isLogin && (
                    <div className="mt-3 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full transition-all duration-300 ${strength < 30 ? 'bg-red-500' : strength < 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${strength}%` }} />
                    </div>
                  )}

                  {/* Confirm Password (Only for Signup) */}
                  {!isLogin && (
                    <div className="pt-2">
                      <PasswordInput 
                        label="Confirm Password"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        showState={showConfirmPassword}
                        toggleFunc={setShowConfirmPassword}
                      />
                    </div>
                  )}

                  {/* Master PIN (Only for Signup) */}
                  {!isLogin && (
                    <div className="space-y-1 pt-2">
                      <label className="block text-sm font-medium text-emerald-400 flex items-center justify-between">
                        <span>6-Digit Master PIN</span>
                        <Lock className="w-3 h-3" />
                      </label>
                      <input type="password" name="pin" maxLength="6" value={formData.pin} onChange={handleChange} placeholder="Required for encryption" className="w-full px-3 py-2 border border-slate-700 rounded-lg bg-slate-950 text-emerald-400 tracking-widest placeholder:text-slate-600 focus:ring-emerald-500 focus:border-emerald-500 font-mono" required />
                      <p className="text-xs text-slate-500 mt-1">Do not forget this PIN. It cannot be recovered.</p>
                    </div>
                  )}
                </>
              )}

              {/* NEW: Remember Me & Forgot Password (Only for Login) */}
              {isLogin && (
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center">
                    <input
                      id="remember-me"
                      name="remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-900"
                    />
                    <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-400">
                      Remember me
                    </label>
                  </div>

                  <div className="text-sm">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setError('');
                        navigate('forgot');
                      }}
                      className="font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      Forgot your password?
                    </button>
                  </div>
                </div>
              )}

              <Button variant="primary" type="submit" className="w-full bg-emerald-600 hover:bg-emerald-500 text-white mt-6 py-2.5" isLoading={loading}>
                {isForgot ? 'Send Reset Link' : isLogin ? 'Access Vault' : 'Create Vault'}
              </Button>
            </form>
          )}

          {!isVerifying && (
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-slate-900 text-slate-400">
                    {isLogin ? 'New to SecureVault?' : 'Already have a vault?'}
                  </span>
                </div>
              </div>

              <div className="mt-6 flex justify-center gap-4">
                {/* FIX 3: Using App.jsx's navigate function properly */}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setError('');
                    navigate(isLogin ? 'register' : 'login');
                  }}
                  className="text-sm font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  {isLogin ? 'Create an account' : 'Sign in instead'}
                </button>
              </div>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
};

export default AuthPage;