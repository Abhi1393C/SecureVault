const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config(); // .env file se variables load karne ke liye

// ==========================================
// 1. Route Imports (Jo abhi banaye hain)
// ==========================================
const authRoutes = require('./routes/authRoutes');
const auditRoutes = require('./routes/auditRoutes');
const documentRoutes = require('./routes/documentRoutes');

// Future routes ke placeholders (Jab inki route files ban jayengi tab uncomment kar lena)
const vaultRoutes = require('./routes/vaultRoutes');
const shareRoutes = require('./routes/shareRoutes');
// const signatureRoutes = require('./routes/signatureRoutes');

const app = express();

// ==========================================
// 2. Middlewares
// ==========================================
app.use(cors({
  origin: ['http://localhost:5173', 'https://securevault-4ke.pages.dev'], // Vite ka URL
  credentials: true 
})); // Frontend (Vite/React) ko backend se connect karne allow karta hai
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ==========================================
// 3. API Routes Register Karna
// ==========================================
app.use('/api/auth', authRoutes);     // Signup aur Login yahan handle honge
app.use('/api/audit', auditRoutes);   // Audit trail ki history yahan se aayegi
app.use('/api/documents', documentRoutes);
app.use('/api/vault', vaultRoutes);
app.use('/api/share', shareRoutes);
// app.use('/api/signature', signatureRoutes);

// Basic Test Route
app.get('/', (req, res) => {
  res.send('SecureVault API is running securely! 🔒');
});

// ==========================================
// 4. Database Connection & Server Start
// ==========================================
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/securevault';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected Successfully!');
    app.listen(PORT, () => {
      console.log(`🚀 SecureVault Server is running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('❌ MongoDB Connection Error:', error);
  });