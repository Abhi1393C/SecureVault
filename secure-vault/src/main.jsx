import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { ToastProvider } from './components/ToastContext.jsx' // 1. Add this import

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* 2. Wrap the entire app so EVERY file can use popups */}
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
)