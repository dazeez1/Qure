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
