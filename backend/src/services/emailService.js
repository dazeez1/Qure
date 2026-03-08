import { BrevoClient } from '@getbrevo/brevo';

/**
 * Production-ready Email Service using Brevo Transactional Email API
 * 
 * This service uses the official Brevo SDK (@getbrevo/brevo) for reliable email delivery.
 * All credentials are loaded from environment variables.
 */

// Initialize Brevo API client (singleton pattern)
let brevoClient = null;

/**
 * Get or initialize the Brevo API client
 * @returns {BrevoClient} Configured Brevo client
 */
function getBrevoClient() {
  if (brevoClient) {
    return brevoClient;
  }

  // Validate required environment variables
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not configured in environment variables');
  }

  if (!senderEmail) {
    throw new Error('BREVO_SENDER_EMAIL is not configured in environment variables');
  }

  // Initialize Brevo client
  brevoClient = new BrevoClient({
    apiKey: apiKey,
  });

  console.log('📧 Brevo Transactional Email API initialized');
  console.log('   Sender:', senderEmail);

  return brevoClient;
}

/**
 * Send email using Brevo Transactional Email API
 * @param {Object} params - Email parameters
 * @param {string} params.to - Recipient email address
 * @param {string} params.subject - Email subject
 * @param {string} params.htmlContent - HTML email content
 * @param {string} [params.textContent] - Plain text email content (optional)
 * @param {string} [params.senderName] - Sender name (default: "Qure")
 * @returns {Promise<Object>} Result object with success status and message
 */
async function sendEmail({ to, subject, htmlContent, textContent, senderName = 'Qure' }) {
  try {
    const client = getBrevoClient();
    const senderEmail = process.env.BREVO_SENDER_EMAIL;

    // Create email data
    const emailData = {
      sender: {
        name: senderName,
        email: senderEmail,
      },
      to: [{ email: to }],
      subject: subject,
      htmlContent: htmlContent,
    };
    
    if (textContent) {
      emailData.textContent = textContent;
    }

    // Send email via Brevo API
    const result = await client.transactionalEmails.sendTransacEmail(emailData);

    console.log('📧 Email sent successfully:', {
      to,
      subject,
      messageId: result.messageId,
    });

    return {
      success: true,
      messageId: result.messageId,
      message: 'Email sent successfully',
    };
  } catch (error) {
    // Log error safely (without exposing sensitive info)
    console.error('❌ Email sending failed:', {
      to,
      subject,
      error: error.message,
      statusCode: error.statusCode || error.response?.statusCode || 'N/A',
    });

    return {
      success: false,
      error: error.message,
      message: 'Failed to send email',
    };
  }
}

/**
 * Send password reset email
 * @param {string} to - Recipient email address
 * @param {string} resetLink - Password reset link
 * @param {string} [firstName] - Recipient's first name (optional)
 * @returns {Promise<Object>} Result object with success status
 */
export async function sendPasswordResetEmail(to, resetLink, firstName = 'User') {
  const subject = 'Reset Your Password';
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #0e3995; margin-bottom: 20px;">Reset Your Password</h2>
      <p>Hello ${firstName},</p>
      <p>You requested to reset your password. Click the button below to reset it:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" 
           style="background-color: #0e3995; color: #fff; padding: 12px 24px; 
                  text-decoration: none; border-radius: 5px; display: inline-block; 
                  font-weight: 600; font-size: 16px;">
          Reset Password
        </a>
      </div>
      <p style="color: #757575; font-size: 14px; margin-top: 20px;">
        Or copy and paste this link into your browser:
      </p>
      <p style="color: #0e3995; word-break: break-all; font-size: 14px; 
                background-color: #f5f5f5; padding: 10px; border-radius: 5px;">
        ${resetLink}
      </p>
      <p style="color: #ef4444; font-weight: 600; margin-top: 20px;">
        ⚠️ This link will expire in 1 hour.
      </p>
      <p style="margin-top: 20px;">
        If you didn't request this password reset, please ignore this email.
      </p>
      <p style="margin-top: 30px; color: #757575; font-size: 12px;">
        Best regards,<br>The Qure Team
      </p>
    </div>
  `;

  const textContent = `Hello ${firstName},\n\nYou requested to reset your password. Click the link below to reset it:\n\n${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you didn't request this, please ignore this email.\n\nBest regards,\nThe Qure Team`;

  return await sendEmail({
    to,
    subject,
    htmlContent,
    textContent,
    senderName: 'Qure',
  });
}

/**
 * Send hospital access code email
 * @param {string} to - Recipient email address
 * @param {string} accessCode - Hospital access code
 * @param {string} hospitalName - Hospital name
 * @returns {Promise<Object>} Result object with success status
 */
export async function sendAccessCodeEmail(to, accessCode, hospitalName) {
  const subject = 'Hospital Access Code';
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #0e3995; margin-bottom: 20px;">Hospital Access Code</h2>
      <p>Hello,</p>
      <p>Your hospital access code for <strong>${hospitalName}</strong> is:</p>
      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; 
                  margin: 30px 0; text-align: center;">
        <h1 style="color: #0e3995; margin: 0; font-size: 32px; letter-spacing: 0.2em; 
                   font-weight: 600;">
          ${accessCode}
        </h1>
      </div>
      <p>Please keep this code secure and share it with your hospital staff who need to register.</p>
      <p style="margin-top: 30px; color: #757575; font-size: 12px;">
        Best regards,<br>The Qure Team
      </p>
    </div>
  `;

  const textContent = `Your hospital access code for ${hospitalName} is: ${accessCode}\n\nPlease keep this code secure and share it with your hospital staff who need to register.\n\nBest regards,\nThe Qure Team`;

  return await sendEmail({
    to,
    subject,
    htmlContent,
    textContent,
    senderName: 'Qure',
  });
}

/**
 * Send appointment confirmation email
 * @param {string} to - Recipient email address
 * @param {Object} appointmentDetails - Appointment details
 * @param {string} appointmentDetails.patientName - Patient name
 * @param {string} appointmentDetails.hospitalName - Hospital name
 * @param {string} appointmentDetails.departmentName - Department name
 * @param {string} appointmentDetails.appointmentDate - Appointment date
 * @param {string} appointmentDetails.appointmentTime - Appointment time
 * @param {string} [appointmentDetails.doctorName] - Doctor name (optional)
 * @returns {Promise<Object>} Result object with success status
 */
export async function sendAppointmentConfirmation(to, appointmentDetails) {
  const {
    patientName,
    hospitalName,
    departmentName,
    appointmentDate,
    appointmentTime,
    doctorName,
  } = appointmentDetails;

  const subject = `Appointment Confirmation - ${hospitalName}`;
  
  const doctorInfo = doctorName 
    ? `<p><strong>Doctor:</strong> ${doctorName}</p>`
    : '';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #0e3995; margin-bottom: 20px;">Appointment Confirmed</h2>
      <p>Hello ${patientName},</p>
      <p>Your appointment has been confirmed. Here are the details:</p>
      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Hospital:</strong> ${hospitalName}</p>
        <p><strong>Department:</strong> ${departmentName}</p>
        ${doctorInfo}
        <p><strong>Date:</strong> ${appointmentDate}</p>
        <p><strong>Time:</strong> ${appointmentTime}</p>
      </div>
      <p style="margin-top: 20px;">
        Please arrive 15 minutes before your scheduled appointment time.
      </p>
      <p style="margin-top: 30px; color: #757575; font-size: 12px;">
        Best regards,<br>The Qure Team
      </p>
    </div>
  `;

  const textContent = `Hello ${patientName},\n\nYour appointment has been confirmed.\n\nHospital: ${hospitalName}\nDepartment: ${departmentName}\n${doctorName ? `Doctor: ${doctorName}\n` : ''}Date: ${appointmentDate}\nTime: ${appointmentTime}\n\nPlease arrive 15 minutes before your scheduled appointment time.\n\nBest regards,\nThe Qure Team`;

  return await sendEmail({
    to,
    subject,
    htmlContent,
    textContent,
    senderName: 'Qure',
  });
}

/**
 * Send queue notification email
 * @param {string} to - Recipient email address
 * @param {Object} queueDetails - Queue details
 * @param {string} queueDetails.patientName - Patient name
 * @param {string} queueDetails.ticketNumber - Queue ticket number
 * @param {string} queueDetails.departmentName - Department name
 * @param {number} queueDetails.positionInQueue - Current position in queue
 * @param {number} queueDetails.estimatedWaitMinutes - Estimated wait time in minutes
 * @param {string} [queueDetails.status] - Queue status (optional)
 * @returns {Promise<Object>} Result object with success status
 */
export async function sendQueueNotification(to, queueDetails) {
  const {
    patientName,
    ticketNumber,
    departmentName,
    positionInQueue,
    estimatedWaitMinutes,
    status,
  } = queueDetails;

  const subject = `Queue Update - Ticket ${ticketNumber}`;
  
  const statusInfo = status 
    ? `<p><strong>Status:</strong> ${status}</p>`
    : '';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #0e3995; margin-bottom: 20px;">Queue Update</h2>
      <p>Hello ${patientName},</p>
      <p>Here's your current queue status:</p>
      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Ticket Number:</strong> ${ticketNumber}</p>
        <p><strong>Department:</strong> ${departmentName}</p>
        ${statusInfo}
        <p><strong>Position in Queue:</strong> ${positionInQueue}</p>
        <p><strong>Estimated Wait Time:</strong> ${estimatedWaitMinutes} minutes</p>
      </div>
      <p style="margin-top: 20px;">
        We'll notify you when it's your turn. Please stay nearby.
      </p>
      <p style="margin-top: 30px; color: #757575; font-size: 12px;">
        Best regards,<br>The Qure Team
      </p>
    </div>
  `;

  const textContent = `Hello ${patientName},\n\nHere's your current queue status:\n\nTicket Number: ${ticketNumber}\nDepartment: ${departmentName}\n${status ? `Status: ${status}\n` : ''}Position in Queue: ${positionInQueue}\nEstimated Wait Time: ${estimatedWaitMinutes} minutes\n\nWe'll notify you when it's your turn. Please stay nearby.\n\nBest regards,\nThe Qure Team`;

  return await sendEmail({
    to,
    subject,
    htmlContent,
    textContent,
    senderName: 'Qure',
  });
}

/**
 * Send announcement email
 * @param {string} to - Recipient email address
 * @param {string} title - Announcement title
 * @param {string} content - Announcement content
 * @param {string} [hospitalName] - Hospital name (optional)
 * @returns {Promise<Object>} Result object with success status
 */
export async function sendAnnouncement(to, title, content, hospitalName = 'Hospital') {
  const subject = `[${hospitalName}] ${title}`;
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #0e3995; margin-bottom: 20px;">${title}</h2>
      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        ${content.split('\n').map(paragraph => 
          paragraph.trim() ? `<p style="margin: 10px 0;">${paragraph}</p>` : ''
        ).join('')}
      </div>
      <p style="margin-top: 30px; color: #757575; font-size: 12px;">
        Best regards,<br>The ${hospitalName} Team
      </p>
    </div>
  `;

  const textContent = `${title}\n\n${content}\n\nBest regards,\nThe ${hospitalName} Team`;

  return await sendEmail({
    to,
    subject,
    htmlContent,
    textContent,
    senderName: hospitalName,
  });
}

/**
 * Send staff invitation email
 * @param {string} to - Recipient email address
 * @param {string} inviteLink - Staff invitation link
 * @param {string} firstName - Invited staff's first name
 * @param {string} inviterName - Name of person sending the invitation
 * @param {string} hospitalName - Hospital name
 * @param {string} role - Staff role (STAFF or ADMIN)
 * @param {string} [staffRole] - Staff role (DOCTOR or NURSE) - optional
 * @returns {Promise<Object>} Result object with success status
 */
export async function sendStaffInvitationEmail(
  to,
  inviteLink,
  firstName,
  inviterName,
  hospitalName,
  role,
  staffRole = null
) {
  const roleDisplay = role === 'ADMIN' 
    ? 'Administrator' 
    : staffRole === 'DOCTOR' 
      ? 'Doctor' 
      : staffRole === 'NURSE' 
        ? 'Nurse' 
        : 'Staff Member';

  const subject = `You've been invited to join ${hospitalName} on Qure`;
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #0e3995; margin-bottom: 20px;">You've Been Invited!</h2>
      <p>Hello ${firstName},</p>
      <p><strong>${inviterName}</strong> has invited you to join <strong>${hospitalName}</strong> as a <strong>${roleDisplay}</strong>.</p>
      <p>Click the button below to accept the invitation and complete your registration:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${inviteLink}" 
           style="background-color: #0e3995; color: #fff; padding: 12px 24px; 
                  text-decoration: none; border-radius: 5px; display: inline-block; 
                  font-weight: 600; font-size: 16px;">
          Accept Invitation
        </a>
      </div>
      <p style="color: #757575; font-size: 14px; margin-top: 20px;">
        Or copy and paste this link into your browser:
      </p>
      <p style="color: #0e3995; word-break: break-all; font-size: 14px; 
                background-color: #f5f5f5; padding: 10px; border-radius: 5px;">
        ${inviteLink}
      </p>
      <p style="color: #ef4444; font-weight: 600; margin-top: 20px;">
        ⚠️ This invitation link will expire in 24 hours.
      </p>
      <p style="margin-top: 20px;">
        If you didn't expect this invitation, please ignore this email.
      </p>
      <p style="margin-top: 30px; color: #757575; font-size: 12px;">
        Best regards,<br>The Qure Team
      </p>
    </div>
  `;

  const textContent = `Hello ${firstName},\n\n${inviterName} has invited you to join ${hospitalName} as a ${roleDisplay}.\n\nClick the link below to accept the invitation and complete your registration:\n\n${inviteLink}\n\nThis invitation link will expire in 24 hours.\n\nIf you didn't expect this invitation, please ignore this email.\n\nBest regards,\nThe Qure Team`;

  return await sendEmail({
    to,
    subject,
    htmlContent,
    textContent,
    senderName: 'Qure',
  });
}

/**
 * Send support message notification email
 * @param {Object} params - Support message parameters
 * @param {string} params.name - Sender name
 * @param {string} params.email - Sender email
 * @param {string} params.message - Support message content
 * @param {string} [params.patientId] - Patient ID if authenticated (optional)
 * @param {string} [params.hospitalId] - Hospital ID if available (optional)
 * @returns {Promise<Object>} Result object with success status
 */
export async function sendSupportMessageEmail({ name, email, message, patientId, hospitalId }) {
  const subject = `New Support Message from ${name}`;
  
  // Get hospital name if hospitalId is provided
  let hospitalName = null;
  if (hospitalId) {
    try {
      const prisma = (await import('../config/database.js')).default;
      const hospital = await prisma.hospital.findUnique({
        where: { id: hospitalId },
        select: { name: true },
      });
      if (hospital) {
        hospitalName = hospital.name;
      }
    } catch (error) {
      console.error('Error fetching hospital name:', error);
    }
  }

  const patientInfo = patientId 
    ? `<p><strong>Patient ID:</strong> ${patientId}</p>`
    : '<p><strong>Type:</strong> Guest User</p>';

  const hospitalInfo = hospitalName
    ? `<p><strong>Hospital:</strong> ${hospitalName}</p>`
    : '';

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #0e3995; margin-bottom: 20px;">New Support Message</h2>
      <p>A new support message has been received through the Qure contact form.</p>
      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>From:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        ${patientInfo}
        ${hospitalInfo}
        <p style="margin-top: 20px;"><strong>Message:</strong></p>
        <div style="background-color: #fff; padding: 15px; border-radius: 5px; margin-top: 10px; white-space: pre-wrap; word-wrap: break-word;">
          ${message.replace(/\n/g, '<br>')}
        </div>
      </div>
      <p style="margin-top: 20px; color: #757575; font-size: 12px;">
        This is an automated notification from the Qure support system.
      </p>
    </div>
  `;

  const textContent = `New Support Message\n\nFrom: ${name}\nEmail: ${email}\n${patientId ? `Patient ID: ${patientId}\n` : 'Type: Guest User\n'}${hospitalName ? `Hospital: ${hospitalName}\n` : ''}\nMessage:\n${message}\n\nThis is an automated notification from the Qure support system.`;

  const supportEmail = process.env.SUPPORT_EMAIL || 'support@qure.com';

  return await sendEmail({
    to: supportEmail,
    subject,
    htmlContent,
    textContent,
    senderName: 'Qure Support System',
  });
}

/**
 * Example controller usage:
 * 
 * import { sendPasswordResetEmail } from '../services/emailService.js';
 * 
 * export const forgotPassword = async (req, res, next) => {
 *   try {
 *     const { email } = req.body;
 *     const resetToken = generateResetToken();
 *     const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
 * 
 *     // Send password reset email
 *     const emailResult = await sendPasswordResetEmail(email, resetLink, 'John');
 * 
 *     if (!emailResult.success) {
 *       console.error('Failed to send password reset email:', emailResult.error);
 *       // Don't fail the request - token is still created
 *     }
 * 
 *     res.status(200).json({
 *       success: true,
 *       message: 'If an account exists with that email, a password reset link has been sent.',
 *     });
 *   } catch (error) {
 *     next(error);
 *   }
 * };
 */
