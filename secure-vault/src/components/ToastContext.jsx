import React, { createContext, useContext, useState } from 'react';
import { X, AlertTriangle, CheckCircle } from 'lucide-react';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000); // Auto-dismiss after 5 seconds
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className={`flex items-start p-4 rounded-xl shadow-2xl border ${
            toast.type === 'error' ? 'bg-red-950/90 border-red-900/50 text-red-200' :
            toast.type === 'success' ? 'bg-emerald-950/90 border-emerald-900/50 text-emerald-200' :
            'bg-slate-900/90 border-slate-800 text-slate-200'
          } backdrop-blur-md max-w-md w-full animate-in slide-in-from-right-8 fade-in duration-300 pointer-events-auto`}>
            {toast.type === 'error' && <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0 text-red-400 mt-0.5" />}
            {toast.type === 'success' && <CheckCircle className="w-5 h-5 mr-3 flex-shrink-0 text-emerald-400 mt-0.5" />}
            <p className="text-sm font-medium leading-relaxed">{toast.message}</p>
            <button onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))} className="ml-auto pl-3 opacity-60 hover:opacity-100 transition-opacity">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};