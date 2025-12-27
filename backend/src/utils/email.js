import nodemailer from 'nodemailer';

let transporter = null;

/**
 * Initialize email transporter (lazy initialization)
 * Uses Ethereal Email for development/testing
 */
async function getTransporter() {
  if (transporter) {
    return transporter;
  }

  try {
    // Create a test account for Ethereal Email (development only)
    const testAccount = await nodemailer.createTestAccount();

    // Create transporter using the test account
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });

    console.log('📧 Ethereal Email Test Account Created');
    console.log('   User:', testAccount.user);
    console.log('   Pass:', testAccount.pass);
    console.log('   Use the Preview URL from console to view emails');

    return transporter;
  } catch (error) {
    console.error('Error creating Ethereal test account:', error);
    throw error;
  }
}

/**
 * Send hospital access code to primary staff
 * @param {string} email - Recipient email address
 * @param {string} accessCode - Hospital access code
 * @param {string} hospitalName - Hospital name
 * @returns {Promise<void>}
 */
export const sendAccessCodeEmail = async (email, accessCode, hospitalName) => {
  try {
    const emailTransporter = await getTransporter();

    // Email content
    const mailOptions = {
      from: '"Qure" <no-reply@qure.com>',
      to: email,
      subject: 'Hospital Access Code',
      text: `Your hospital access code for ${hospitalName} is: ${accessCode}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0e3995;">Hospital Access Code</h2>
          <p>Hello,</p>
          <p>Your hospital access code for <strong>${hospitalName}</strong> is:</p>
          <div style="background-color: #f5f5f5; padding: 1.5rem; border-radius: 0.5rem; margin: 1.5rem 0; text-align: center;">
            <h1 style="color: #0e3995; margin: 0; font-size: 2rem; letter-spacing: 0.2em;">${accessCode}</h1>
          </div>
          <p>Please keep this code secure and share it with your hospital staff who need to register.</p>
          <p>Best regards,<br>The Qure Team</p>
        </div>
      `,
    };

    // Send email
    const info = await emailTransporter.sendMail(mailOptions);

    // Log preview URL for Ethereal emails (development only)
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('📧 Email sent! Preview URL:', previewUrl);
      console.log('   Open this URL in your browser to view the email');
    } else {
      console.log('📧 Email sent successfully');
    }

    console.log('📧 Email details:', {
      to: email,
      subject: mailOptions.subject,
      messageId: info.messageId,
    });
  } catch (error) {
    console.error('Error sending access code email:', error);
    throw error;
  }
};

/**
 * Send password reset email
 * @param {string} email - Recipient email address
 * @param {string} resetToken - Password reset token
 * @param {string} firstName - User's first name (optional)
 * @returns {Promise<void>}
 */
export const sendPasswordResetEmail = async (email, resetToken, firstName = 'User') => {
  try {
    const emailTransporter = await getTransporter();
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    // Email content
    const mailOptions = {
      from: '"Qure" <no-reply@qure.com>',
      to: email,
      subject: 'Reset Your Password',
      text: `Hello ${firstName},\n\nYou requested to reset your password. Click the link below to reset it:\n\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nThe Qure Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #0e3995;">Reset Your Password</h2>
          <p>Hello ${firstName},</p>
          <p>You requested to reset your password. Click the button below to reset it:</p>
          <div style="text-align: center; margin: 2rem 0;">
            <a href="${resetUrl}" style="background-color: #0e3995; color: #fff; padding: 1.2rem 2.4rem; text-decoration: none; border-radius: 0.5rem; display: inline-block; font-weight: 600;">Reset Password</a>
          </div>
          <p style="color: #757575; font-size: 1.4rem;">Or copy and paste this link into your browser:</p>
          <p style="color: #0e3995; word-break: break-all; font-size: 1.4rem;">${resetUrl}</p>
          <p style="color: #ef4444; font-weight: 600;">This link will expire in 1 hour.</p>
          <p>If you didn't request this password reset, please ignore this email.</p>
          <p>Best regards,<br>The Qure Team</p>
        </div>
      `,
    };

    // Send email
    const info = await emailTransporter.sendMail(mailOptions);

    // Log preview URL for Ethereal emails (development only)
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('📧 Password reset email sent! Preview URL:', previewUrl);
      console.log('   Open this URL in your browser to view the email');
    } else {
      console.log('📧 Password reset email sent successfully');
    }

    console.log('📧 Password reset email details:', {
      to: email,
      subject: mailOptions.subject,
      messageId: info.messageId,
    });
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};
