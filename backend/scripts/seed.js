const mongoose = require('mongoose');
require('dotenv').config(); // .env se MONGO_URI read karne ke liye
const { User, Document, AuditLog, Session } = require('../models/schema');

async function seedDatabase() {
  try {
    // 1. Database Connect 
    await mongoose.connect(process.env.MONGO_URI, {
      dbName: 'secureVaultDB' // Ye strictly Mongoose ko force karega is DB mein data dalne ke liye
    });
    console.log('✅ Database connected');

    
    await User.deleteMany({});
    await Document.deleteMany({});
    await AuditLog.deleteMany({});
    await Session.deleteMany({});
    console.log('🧹 Cleared old data');

    // 2. Dummy Users 
    const owner = new User({
      name: "Abhinav Maurya",
      email: "abhinav@example.com",
      passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyHashOwner",
      pinHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyPinOwner"
    });
    await owner.save();

    const partner = new User({
      name: "Neesha Yadav", 
      email: "neesha@example.com",
      passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$dummyHashPartner",
      role: "Editor"
    });
    await partner.save();
    console.log('👤 Users created');

    // 3. Dummy Document (Encrypted & Signed)
    const doc = new Document({
      ownerId: owner._id,
      fileName: "Final_Year_Project_Report.pdf",
      storageMode: "Encrypted",
      fileUrl: "securevault-files/final_year_project.pdf",
      encryptedKeyMeta: {
        iv: "d283ea4f9c5a", 
        salt: "8f7a9d0b"    
      },
      isSigned: true,
      signature: {
        signedBy: owner._id,
        signatureHash: "b10a8db164e0754105b7a99be72e3fe5",
        signedAt: new Date()
      },
      sharedWith: [
        {
          userId: partner._id,
          role: "Editor",
          sharedAt: new Date()
        }
      ]
    });
    await doc.save();
    console.log('📄 Document created');

    // 4. Dummy Audit Log 
    const audit = new AuditLog({
      performedBy: owner._id,
      documentId: doc._id,
      action: "upload_and_sign",
      prevHash: "0000000000000000000000000000000000000000000000000000000000000000", 
      currentHash: "3a42c503953909637f78dd8c99b3b85ddde362415585afc11901bdefe8349102",
      timestamp: new Date()
    });
    await audit.save();
    console.log('🔍 Audit Log created');

    console.log('🎉 Schema initialized & data inserted! Ready for review.');

  } catch (error) {
    console.error("❌ Error inserting data:", error);
  } finally {
    mongoose.connection.close(); // Connection close on script end
  }
}

seedDatabase();