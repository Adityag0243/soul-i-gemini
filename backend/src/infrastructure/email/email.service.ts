import nodemailer from 'nodemailer';
import logger from '../../core/logger';

// Email configuration from environment variables
const EMAIL_CONFIG = {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
    },
};

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@yourlabs.com';
const FROM_NAME = process.env.FROM_NAME || 'YourLabs';

// Create transporter
const createTransporter = () => {
    return nodemailer.createTransport({
        host: EMAIL_CONFIG.host,
        port: EMAIL_CONFIG.port,
        secure: EMAIL_CONFIG.secure,
        auth: {
            user: EMAIL_CONFIG.auth.user,
            pass: EMAIL_CONFIG.auth.pass,
        },
    });
};

/**
 * Send refund approval email to patient
 */
export async function sendRefundApprovalEmail(data: {
    patientName: string;
    patientEmail: string;
    originalAmount: number;
    refundAmount: number;
    deductionPercent: number;
}): Promise<void> {
    const transporter = createTransporter();

    const deductionAmount = data.originalAmount - data.refundAmount;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Refund Approved</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
      border-radius: 10px 10px 0 0;
    }
    .content {
      background: #f9f9f9;
      padding: 30px;
      border-radius: 0 0 10px 10px;
    }
    .amount-box {
      background: white;
      border: 2px solid #667eea;
      border-radius: 10px;
      padding: 20px;
      margin: 20px 0;
      text-align: center;
    }
    .refund-amount {
      font-size: 32px;
      color: #28a745;
      font-weight: bold;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .details-table td {
      padding: 10px;
      border-bottom: 1px solid #eee;
    }
    .details-table td:first-child {
      color: #666;
    }
    .details-table td:last-child {
      text-align: right;
      font-weight: 500;
    }
    .footer {
      text-align: center;
      color: #888;
      font-size: 12px;
      margin-top: 30px;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">🏥 YourLabs</div>
    <h1 style="margin: 10px 0 0 0;">Refund Approved!</h1>
  </div>
  
  <div class="content">
    <p>Dear <strong>${data.patientName}</strong>,</p>
    
    <p>Great news! Your refund request has been approved. Here are the details:</p>
    
    <div class="amount-box">
      <div style="color: #666; margin-bottom: 5px;">Refund Amount</div>
      <div class="refund-amount">₹${data.refundAmount.toFixed(2)}</div>
    </div>
    
    <table class="details-table">
      <tr>
        <td>Original Payment</td>
        <td>₹${data.originalAmount.toFixed(2)}</td>
      </tr>
      <tr>
        <td>Deduction (${data.deductionPercent}%)</td>
        <td>₹${deductionAmount.toFixed(2)}</td>
      </tr>
      <tr>
        <td><strong>Final Refund</strong></td>
        <td><strong style="color: #28a745;">₹${data.refundAmount.toFixed(
            2,
        )}</strong></td>
      </tr>
    </table>
    
    <p>The refund will be processed to your original payment method within 5-7 business days.</p>
    
    <p>If you have any questions, please don't hesitate to contact our support team.</p>
    
    <p>Best regards,<br><strong>YourLabs Team</strong></p>
  </div>
  
  <div class="footer">
    <p>This is an automated email. Please do not reply directly to this message.</p>
    <p>© ${new Date().getFullYear()} YourLabs. All rights reserved.</p>
  </div>
</body>
</html>
  `;

    const textContent = `
Dear ${data.patientName},

Great news! Your refund request has been approved.

REFUND DETAILS:
- Original Payment: ₹${data.originalAmount.toFixed(2)}
- Deduction (${data.deductionPercent}%): ₹${deductionAmount.toFixed(2)}
- Final Refund: ₹${data.refundAmount.toFixed(2)}

The refund will be processed to your original payment method within 5-7 business days.

If you have any questions, please don't hesitate to contact our support team.

Best regards,
YourLabs Team
  `;

    try {
        await transporter.sendMail({
            from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
            to: data.patientEmail,
            subject: '✅ Your Refund Has Been Approved - YourLabs',
            text: textContent,
            html: htmlContent,
        });

        logger.info(`Refund approval email sent to ${data.patientEmail}`);
    } catch (error) {
        logger.error('Failed to send refund approval email', { error });
        throw error;
    }
}

/**
 * Send refund rejection email to patient (optional)
 */
export async function sendRefundRejectionEmail(data: {
    patientName: string;
    patientEmail: string;
    reason?: string;
}): Promise<void> {
    const transporter = createTransporter();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Refund Request Update</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #dc3545;">Refund Request Update</h2>
  
  <p>Dear <strong>${data.patientName}</strong>,</p>
  
  <p>We regret to inform you that your refund request could not be approved at this time.</p>
  
  ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ''}
  
  <p>If you believe this is an error or have any questions, please contact our support team.</p>
  
  <p>Best regards,<br><strong>YourLabs Team</strong></p>
</body>
</html>
  `;

    try {
        await transporter.sendMail({
            from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
            to: data.patientEmail,
            subject: 'Refund Request Update - YourLabs',
            html: htmlContent,
        });

        logger.info(`Refund rejection email sent to ${data.patientEmail}`);
    } catch (error) {
        logger.error('Failed to send refund rejection email:', error);
        throw error;
    }
}

/**
 * Send refund initiated email to patient (when patient cancels UPI-paid appointment)
 */
async function sendRefundInitiatedEmail(
    email: string,
    name: string,
    refundAmount: number,
    originalAmount: number,
    deductionPercent: number,
): Promise<void> {
    const transporter = createTransporter();

    const deductionAmount = originalAmount - refundAmount;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Refund Initiated</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      text-align: center;
      border-radius: 10px 10px 0 0;
    }
    .content {
      background: #f9f9f9;
      padding: 30px;
      border-radius: 0 0 10px 10px;
    }
    .amount-box {
      background: white;
      border: 2px solid #ffc107;
      border-radius: 10px;
      padding: 20px;
      margin: 20px 0;
      text-align: center;
    }
    .refund-amount {
      font-size: 32px;
      color: #ffc107;
      font-weight: bold;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    .details-table td {
      padding: 10px;
      border-bottom: 1px solid #eee;
    }
    .details-table td:first-child {
      color: #666;
    }
    .details-table td:last-child {
      text-align: right;
      font-weight: 500;
    }
    .footer {
      text-align: center;
      color: #666;
      font-size: 12px;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Refund Initiated</h1>
    <p>Your refund request is being processed</p>
  </div>
  <div class="content">
    <p>Dear ${name},</p>
    <p>Your appointment has been cancelled and a refund has been initiated.</p>
    
    <div class="amount-box">
      <p style="margin: 0; color: #666;">Refund Amount</p>
      <p class="refund-amount">₹${refundAmount.toFixed(2)}</p>
    </div>
    
    <table class="details-table">
      <tr>
        <td>Original Amount</td>
        <td>₹${originalAmount.toFixed(2)}</td>
      </tr>
      ${
          deductionPercent > 0
              ? `
      <tr>
        <td>Deduction (${deductionPercent}%)</td>
        <td style="color: #dc3545;">-₹${deductionAmount.toFixed(2)}</td>
      </tr>
      <tr>
        <td colspan="2" style="font-size: 12px; color: #666; border: none;">
          * A ${deductionPercent}% deduction was applied as the appointment was cancelled within 2 hours of the scheduled time.
        </td>
      </tr>
      `
              : ''
      }
      <tr>
        <td><strong>Final Refund</strong></td>
        <td><strong style="color: #28a745;">₹${refundAmount.toFixed(2)}</strong></td>
      </tr>
    </table>
    
    <p>The refund will be processed to your original payment method within 5-7 business days.</p>
    
    <p>If you have any questions, please contact our support team.</p>
    
    <p>Best regards,<br>YourLabs Team</p>
  </div>
  <div class="footer">
    <p>This is an automated email. Please do not reply to this email.</p>
  </div>
</body>
</html>
  `;

    try {
        await transporter.sendMail({
            from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
            to: email,
            subject: 'Refund Initiated - YourLabs',
            html: htmlContent,
        });

        logger.info(`Refund initiated email sent to ${email}`);
    } catch (error) {
        logger.error('Failed to send refund initiated email:', error);
        throw error;
    }
}

/**
 * Send payment confirmation email to patient (Razorpay success)
 */
export async function sendPaymentConfirmationEmail(data: {
    patientName: string;
    patientEmail: string;
    appointmentId: number;
    verificationCode: string;
    doctorName: string;
    appointmentDate: string;
    appointmentTime: string;
    amount: number;
    paymentMethod?: string;
    razorpayPaymentId?: string;
}): Promise<void> {
    const transporter = createTransporter();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Successful</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .success-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .content {
      padding: 30px;
    }
    .verification-box {
      background: #f8f9fa;
      border: 2px dashed #28a745;
      border-radius: 10px;
      padding: 20px;
      margin: 20px 0;
      text-align: center;
    }
    .verification-code {
      font-size: 36px;
      font-weight: bold;
      color: #28a745;
      letter-spacing: 3px;
      margin: 10px 0;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      background: #f8f9fa;
      border-radius: 8px;
      overflow: hidden;
    }
    .details-table tr {
      border-bottom: 1px solid #dee2e6;
    }
    .details-table tr:last-child {
      border-bottom: none;
    }
    .details-table td {
      padding: 12px 15px;
    }
    .details-table td:first-child {
      color: #666;
      font-weight: 500;
    }
    .details-table td:last-child {
      text-align: right;
      color: #333;
    }
    .amount-highlight {
      background: #28a745;
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: bold;
    }
    .footer {
      text-align: center;
      color: #888;
      font-size: 12px;
      padding: 20px;
      background: #f8f9fa;
    }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background: #28a745;
      color: white !important;
      text-decoration: none;
      border-radius: 5px;
      margin: 20px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="success-icon">✓</div>
      <h1 style="margin: 0;">Payment Successful!</h1>
      <p style="margin: 10px 0 0 0;">Your appointment has been confirmed</p>
    </div>
    
    <div class="content">
      <p>Dear <strong>${data.patientName}</strong>,</p>
      
      <p>Thank you! Your payment has been received successfully and your appointment is now confirmed.</p>
      
      <div class="verification-box">
        <p style="margin: 0 0 5px 0; color: #666; font-size: 14px;">Your Verification Code</p>
        <div class="verification-code">${data.verificationCode}</div>
        <p style="margin: 5px 0 0 0; color: #666; font-size: 12px;">Show this code at the clinic</p>
      </div>
      
      <h3 style="color: #28a745;">📅 Appointment Details</h3>
      <table class="details-table">
        <tr>
          <td>Appointment ID</td>
          <td>#${data.appointmentId}</td>
        </tr>
        <tr>
          <td>Doctor</td>
          <td><strong>${data.doctorName}</strong></td>
        </tr>
        <tr>
          <td>Date</td>
          <td>${new Date(data.appointmentDate).toLocaleDateString('en-IN', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
          })}</td>
        </tr>
        <tr>
          <td>Time</td>
          <td><strong>${data.appointmentTime}</strong></td>
        </tr>
      </table>
      
      <h3 style="color: #28a745;">💳 Payment Details</h3>
      <table class="details-table">
        <tr>
          <td>Amount Paid</td>
          <td><span class="amount-highlight">₹${data.amount.toFixed(2)}</span></td>
        </tr>
        ${
            data.paymentMethod
                ? `
        <tr>
          <td>Payment Method</td>
          <td>${data.paymentMethod}</td>
        </tr>
        `
                : ''
        }
        ${
            data.razorpayPaymentId
                ? `
        <tr>
          <td>Transaction ID</td>
          <td style="font-family: monospace; font-size: 12px;">${data.razorpayPaymentId}</td>
        </tr>
        `
                : ''
        }
        <tr>
          <td>Payment Status</td>
          <td><strong style="color: #28a745;">✓ Completed</strong></td>
        </tr>
      </table>
      
      <p style="background: #fff3cd; 
border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <strong>⚠️ Important:</strong> Please arrive 10 minutes before your scheduled time and bring a valid ID along with your verification code.
      </p>
      
      <p>If you need to cancel or reschedule, please do so at least 2 hours before your appointment time to avoid cancellation charges.</p>
      
      <p>Best regards,<br><strong>YourLabs Team</strong></p>
    </div>
    
    <div class="footer">
      <p>This is an automated email. Please do not reply directly to this message.</p>
      <p>For support, contact us at support@yourlabs.com</p>
      <p>© ${new Date().getFullYear()} YourLabs. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;

    const textContent = `
Payment Successful!

Dear ${data.patientName},

Your payment has been received successfully and your appointment is now confirmed.

VERIFICATION CODE: ${data.verificationCode}
(Show this code at the clinic)

APPOINTMENT DETAILS:
- Appointment ID: #${data.appointmentId}
- Doctor: ${data.doctorName}
- Date: ${new Date(data.appointmentDate).toLocaleDateString('en-IN')}
- Time: ${data.appointmentTime}

PAYMENT DETAILS:
- Amount Paid: ₹${data.amount.toFixed(2)}
${data.paymentMethod ? `- Payment Method: ${data.paymentMethod}` : ''}
${data.razorpayPaymentId ? `- Transaction ID: ${data.razorpayPaymentId}` : ''}
- Payment Status: Completed

IMPORTANT: Please arrive 10 minutes before your scheduled time and bring a valid ID along with your verification code.

If you need to cancel or reschedule, please do so at least 2 hours before your appointment time to avoid cancellation charges.

Best regards,
YourLabs Team
  `;

    try {
        await transporter.sendMail({
            from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
            to: data.patientEmail,
            subject: '✅ Payment Successful - Appointment Confirmed | YourLabs',
            text: textContent,
            html: htmlContent,
        });

        logger.info(`Payment confirmation email sent to ${data.patientEmail}`);
    } catch (error) {
        logger.error('Failed to send payment confirmation email:', error);
        throw error;
    }
}

/**
 * Send payment failed email to patient
 */
export async function sendPaymentFailedEmail(data: {
    patientName: string;
    patientEmail: string;
    appointmentId: number;
    amount: number;
    errorReason?: string;
}): Promise<void> {
    const transporter = createTransporter();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Failed</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .error-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .content {
      padding: 30px;
    }
    .alert-box {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .error-box {
      background: #f8d7da;
      border-left: 4px solid #dc3545;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
      color: #721c24;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      background: #f8f9fa;
      border-radius: 8px;
      overflow: hidden;
    }
    .details-table td {
      padding: 12px 15px;
      border-bottom: 1px solid #dee2e6;
    }
    .details-table tr:last-child td {
      border-bottom: none;
    }
    .details-table td:first-child {
      color: #666;
    }
    .details-table td:last-child {
      text-align: right;
    }
    .button {
      display: inline-block;
      padding: 12px 30px;
      background: #007bff;
      color: white !important;
      text-decoration: none;
      border-radius: 5px;
      margin: 20px 0;
      text-align: center;
    }
    .footer {
      text-align: center;
      color: #888;
      font-size: 12px;
      padding: 20px;
      background: #f8f9fa;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="error-icon">⚠️</div>
      <h1 style="margin: 0;">Payment Failed</h1>
      <p style="margin: 10px 0 0 0;">Your appointment is not yet confirmed</p>
    </div>
    
    <div class="content">
      <p>Dear <strong>${data.patientName}</strong>,</p>
      
      <p>We're sorry, but your payment could not be processed.</p>
      
      ${
          data.errorReason
              ? `
      <div class="error-box">
        <strong>Error Reason:</strong> ${data.errorReason}
      </div>
      `
              : ''
      }
      
      <div class="alert-box">
        <strong>⚠️ Your appointment slot is still reserved!</strong><br>
        Don't worry, your appointment slot is temporarily held for you. Please complete the payment to confirm your booking.
      </div>
      
      <h3>📋 Appointment Details</h3>
      <table class="details-table">
        <tr>
          <td>Appointment ID</td>
          <td>#${data.appointmentId}</td>
        </tr>
        <tr>
          <td>Amount</td>
          <td><strong>₹${data.amount.toFixed(2)}</strong></td>
        </tr>
        <tr>
          <td>Status</td>
          <td style="color: #dc3545;"><strong>Payment Pending</strong></td>
        </tr>
      </table>
      
      <h3>🔄 How to Complete Payment:</h3>
      <ol style="margin: 15px 0; padding-left: 20px;">
        <li>Open the YourLabs mobile app</li>
        <li>Go to "My Appointments"</li>
        <li>Find appointment #${data.appointmentId}</li>
        <li>Click "Complete Payment"</li>
        <li>Choose your preferred payment method</li>
      </ol>
      
      <div style="text-align: center;">
        <a href="yourlabs://appointments/${data.appointmentId}" class="button">
          Open App & Pay Now
        </a>
      </div>
      
      <h3>💡 Common Payment Issues:</h3>
      <ul style="margin: 10px 0; padding-left: 20px; color: #666;">
        <li>Insufficient balance in account</li>
        <li>Payment cancelled by user</li>
        <li>Network connectivity issues</li>
        <li>Incorrect payment details</li>
        <li>Bank server downtime</li>
      </ul>
      
      <p style="background: #d1ecf1; border: 1px solid #bee5eb; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <strong>💬 Need Help?</strong><br>
        If you continue to face issues, please contact our support team at <strong>support@yourlabs.com</strong> or call <strong>+91-XXXXXXXXXX</strong>
      </p>
      
      <p>Best regards,<br><strong>YourLabs Team</strong></p>
    </div>
    
    <div class="footer">
      <p>This is an automated email. Please do not reply directly to this message.</p>
      <p>© ${new Date().getFullYear()} YourLabs. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;

    const textContent = `
Payment Failed

Dear ${data.patientName},

We're sorry, but your payment could not be processed.

${data.errorReason ? `Error Reason: ${data.errorReason}` : ''}

YOUR APPOINTMENT SLOT IS STILL RESERVED!
Don't worry, your appointment slot is temporarily held for you. Please complete the payment to confirm your booking.

APPOINTMENT DETAILS:
- Appointment ID: #${data.appointmentId}
- Amount: ₹${data.amount.toFixed(2)}
- Status: Payment Pending

HOW TO COMPLETE PAYMENT:
1. Open the YourLabs mobile app
2. Go to "My Appointments"
3. Find appointment #${data.appointmentId}
4. Click "Complete Payment"
5. Choose your preferred payment method

COMMON PAYMENT ISSUES:
- Insufficient balance in account
- Payment cancelled by user
- Network connectivity issues
- Incorrect payment details
- Bank server downtime

Need Help? Contact our support team at support@yourlabs.com or call +91-XXXXXXXXXX

Best regards,
YourLabs Team
  `;

    try {
        await transporter.sendMail({
            from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
            to: data.patientEmail,
            subject: '⚠️ Payment Failed - Action Required | YourLabs',
            text: textContent,
            html: htmlContent,
        });

        logger.info(`Payment failed email sent to ${data.patientEmail}`);
    } catch (error) {
        logger.error('Failed to send payment failed email:', error);
        throw error;
    }
}

/**
 * Send refund completed email to patient (when Razorpay webhook confirms refund)
 */
export async function sendRefundCompletedEmail(data: {
    patientName: string;
    patientEmail: string;
    refundAmount: number;
    razorpayRefundId: string;
    originalAmount: number;
    appointmentId: number;
}): Promise<void> {
    const transporter = createTransporter();

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Refund Completed</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .success-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .content {
      padding: 30px;
    }
    .amount-box {
      background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%);
      border: 2px solid #28a745;
      border-radius: 10px;
      padding: 25px;
      margin: 25px 0;
      text-align: center;
    }
    .refund-amount {
      font-size: 42px;
      color: #28a745;
      font-weight: bold;
      margin: 10px 0;
    }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      background: #f8f9fa;
      border-radius: 8px;
      overflow: hidden;
    }
    .details-table td {
      padding: 12px 15px;
      border-bottom: 1px solid #dee2e6;
    }
    .details-table tr:last-child td {
      border-bottom: none;
    }
    .details-table td:first-child {
      color: #666;
    }
    .details-table td:last-child {
      text-align: right;
    }
    .info-box {
      background: #d1ecf1;
      border-left: 4px solid #17a2b8;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .footer {
      text-align: center;
      color: #888;
      font-size: 12px;
      padding: 20px;
      background: #f8f9fa;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="success-icon">✅</div>
      <h1 style="margin: 0;">Refund Completed!</h1>
      <p style="margin: 10px 0 0 0;">Your money is on its way</p>
    </div>
    
    <div class="content">
      <p>Dear <strong>${data.patientName}</strong>,</p>
      
      <p>Great news! Your refund has been successfully processed.</p>
      
      <div class="amount-box">
        <div style="color: #2e7d32; font-size: 16px; margin-bottom: 5px;">💰 Refund Amount</div>
        <div class="refund-amount">₹${data.refundAmount.toFixed(2)}</div>
        <div style="color: #2e7d32; font-size: 14px; margin-top: 5px;">Credited to your account</div>
      </div>
      
      <h3 style="color: #28a745;">📝 Refund Details</h3>
      <table class="details-table">
        <tr>
          <td>Appointment ID</td>
          <td>#${data.appointmentId}</td>
        </tr>
        <tr>
          <td>Original Amount</td>
          <td>₹${data.originalAmount.toFixed(2)}</td>
        </tr>
        <tr>
          <td>Refund Amount</td>
          <td><strong style="color: #28a745;">₹${data.refundAmount.toFixed(2)}</strong></td>
        </tr>
        <tr>
          <td>Refund ID</td>
          <td style="font-family: monospace; font-size: 12px;">${data.razorpayRefundId}</td>
        </tr>
        <tr>
          <td>Status</td>
          <td><strong style="color: #28a745;">✓ Completed</strong></td>
        </tr>
      </table>
      
      <div class="info-box">
        <strong>ℹ️ When will I receive my refund?</strong><br>
        The refund amount will reflect in your bank account/card/UPI within <strong>5-7 business days</strong> depending on your bank's processing time.
      </div>
      
      <h3>💳 Refund Destination</h3>
      <p>The refund has been credited to the same payment method you used for the original payment.</p>
      
      <p style="background: #fff3cd; border: 1px solid #ffc107; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <strong>📱 Check Your Account:</strong> You may check your account statement or transaction history to verify the refund. If you don't see it within 7 business days, please contact your bank.
      </p>
      
      <p>We're sorry your appointment couldn't proceed as planned. We hope to serve you better next time!</p>
      
      <p>If you have any questions about this refund, feel free to contact our support team.</p>
      
      <p>Best regards,<br><strong>YourLabs Team</strong></p>
    </div>
    
    <div class="footer">
      <p>This is an automated email. Please do not reply directly to this message.</p>
      <p>For support, contact us at support@yourlabs.com</p>
      <p>© ${new Date().getFullYear()} YourLabs. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;

    const textContent = `
Refund Completed!

Dear ${data.patientName},

Great news! Your refund has been successfully processed.

REFUND AMOUNT: ₹${data.refundAmount.toFixed(2)}

REFUND DETAILS:
- Appointment ID: #${data.appointmentId}
- Original Amount: ₹${data.originalAmount.toFixed(2)}
- Refund Amount: ₹${data.refundAmount.toFixed(2)}
- Refund ID: ${data.razorpayRefundId}
- Status: Completed

WHEN WILL I RECEIVE MY REFUND?
The refund amount will reflect in your bank account/card/UPI within 5-7 business days depending on your bank's processing time.

REFUND DESTINATION:
The refund has been credited to the same payment method you used for the original payment.

CHECK YOUR ACCOUNT: You may check your account statement or transaction history to verify the refund. If you don't see it within 7 business days, please contact your bank.

We're sorry your appointment couldn't proceed as planned. We hope to serve you better next time!

If you have any questions about this refund, feel free to contact our support team.

Best regards,
YourLabs Team
  `;

    try {
        await transporter.sendMail({
            from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
            to: data.patientEmail,
            subject: '✅ Refund Completed - Money on the Way | YourLabs',
            text: textContent,
            html: htmlContent,
        });

        logger.info(`Refund completed email sent to ${data.patientEmail}`);
    } catch (error) {
        logger.error('Failed to send refund completed email:', error);
        throw error;
    }
}

// Export as default object for easier importing
const EmailService = {
    sendRefundApprovalEmail,
    sendRefundRejectionEmail,
    sendRefundInitiatedEmail,
    sendPaymentConfirmationEmail,
    sendPaymentFailedEmail,
    sendRefundCompletedEmail,
};

export default EmailService;
