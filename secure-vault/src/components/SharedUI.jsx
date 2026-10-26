import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export const Button = ({ children, variant = 'primary', className = '', icon: Icon, onClick, type = 'button', disabled }) => {
  // Added focus:ring-offset-slate-950 so the ring effect looks good on dark backgrounds
  const baseStyle = "inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-emerald-600 text-white hover:bg-emerald-500 focus:ring-emerald-500 shadow-sm",
    secondary: "bg-slate-800 text-white hover:bg-slate-700 focus:ring-slate-500 shadow-sm",
    // Changed outline to use slate-900 background and slate-700 border
    outline: "border border-slate-700 text-slate-300 hover:bg-slate-800 focus:ring-slate-500 bg-slate-900",
    // Changed ghost to a subtle slate-400 text that brightens on hover
    ghost: "text-slate-400 hover:bg-slate-800 hover:text-slate-200 focus:ring-slate-500",
    danger: "bg-red-600 text-white hover:bg-red-500 focus:ring-red-500 shadow-sm"
  };

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant]} ${className}`}>
      {Icon && <Icon className={`w-4 h-4 ${children ? 'mr-2' : ''}`} />}
      {children}
    </button>
  );
};

export const Badge = ({ children, variant = 'default', className = '' }) => {
  // Transformed badges from solid colors to subtle translucent borders & backgrounds (Cyberpunk/Dark mode vibe)
  const variants = {
    default: "bg-slate-800 text-slate-300 border border-slate-700",
    success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    danger: "bg-red-500/10 text-red-400 border border-red-500/20",
    secure: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  };
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

// ─── Feature 2: Modal closes on Escape key ───────────────────────────────────
export const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-md" }) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:p-0">
        {/* Darkened the background overlay slightly for better focus */}
        <div className="fixed inset-0 transition-opacity bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
        
        {/* Changed bg-white to bg-slate-900 and added a border */}
        <div className={`relative inline-block w-full ${maxWidth} p-6 overflow-hidden text-left align-middle transition-all transform bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl`}>
          <div className="flex items-center justify-between mb-5">
            {/* Changed title text color to slate-100 */}
            <h3 className="text-lg font-semibold leading-6 text-slate-100">{title}</h3>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};