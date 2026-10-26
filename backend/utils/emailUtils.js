const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendOTP = async (toEmail, otp) => {
  const mailOptions = {
    from: `"SecureVault" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Your SecureVault Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
        <h2>SecureVault Account Verification</h2>
        <p>Your 6-digit OTP for email verification is:</p>
        <h1 style="background: #f4f4f4; padding: 10px; letter-spacing: 5px; color: #10b981;">${otp}</h1>
        <p>This OTP is valid for 10 minutes. Do not share it with anyone.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

const sendEmail = async ({ email, subject, html }) => {
  const mailOptions = {
    from: `"SecureVault Security" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: subject,
    html: html,
  };

  await transporter.sendMail(mailOptions);
};

// Dono ko export kar diya
module.exports = { sendOTP, sendEmail };