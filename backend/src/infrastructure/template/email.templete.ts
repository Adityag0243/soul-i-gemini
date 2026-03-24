export const getPasswordResetMailTemplate = (
    name: string,
    resetLink: string,
) => {
    const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f4f4f4;
            margin: 0;
            padding: 0;
        }
        .email-wrapper {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 20px;
            text-align: center;
            color: white;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        .content {
            padding: 40px 30px;
        }
        .greeting {
            font-size: 18px;
            color: #333;
            margin-bottom: 20px;
            font-weight: 600;
        }
        .message {
            font-size: 14px;
            line-height: 1.8;
            color: #666;
            margin-bottom: 30px;
        }
        .warning-box {
            background-color: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 4px;
            font-size: 14px;
            color: #856404;
        }
        .button-container {
            text-align: center;
            margin: 30px 0;
        }
        .button {
            display: inline-block;
            padding: 12px 40px;
            background: white;
            color: #764ba2;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            transition: transform 0.2s;
        }
        .button:hover {
            transform: translateY(-2px);
        }
        .footer {
            background-color: #f8f9fa;
            padding: 30px 20px;
            text-align: center;
            border-top: 1px solid #e0e0e0;
            font-size: 12px;
            color: #666;
        }
        .footer p {
            margin: 8px 0;
        }
        .security-note {
            background-color: #e8f5e9;
            border-left: 4px solid #4caf50;
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 4px;
            font-size: 13px;
            color: #2e7d32;
        }
        .code {
            font-family: 'Courier New', monospace;
            background-color: #f5f5f5;
            padding: 15px;
            border-radius: 4px;
            word-break: break-all;
            font-size: 12px;
            color: #333;
            margin: 15px 0;
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="header">
            <h1>🔐 Password Reset Request</h1>
        </div>
        
        <div class="content">
            <div class="greeting">Hi ${name},</div>
            
            <div class="message">
                We received a request to reset the password for your YourLabs account. If you didn't make this request, you can ignore this email.
            </div>
            
            <div class="warning-box">
                ⏱️ <strong>Important:</strong> This password reset link will expire in <strong>30 minutes</strong>. Please reset your password as soon as possible.
            </div>
            
            <div class="button-container">
                <a href="${resetLink}" class="button">Reset Password</a>
            </div>
            
            <div style="text-align: center; color: #999; font-size: 13px; margin: 20px 0;">
                Or copy and paste this link in your browser:
            </div>
            
            <div class="code">
                ${resetLink}
            </div>
            
            <div class="security-note">
                🔒 <strong>Security Note:</strong> This link can only be used once. After you reset your password, this link will no longer work.
            </div>
            
            <div class="message" style="margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 6px;">
                <strong>Didn't request this?</strong> If you didn't request a password reset, your account is still secure. Someone else may have entered your email by mistake. Just ignore this email or change your password to be extra safe.
            </div>
        </div>
        
        <div class="footer">
            <p>This is an automated message, please do not reply to this email.</p>
            <p style="margin-top: 15px;">© 2025 YourLabs. All rights reserved.</p>
        </div>
    </div>
</body>
</html>`;
    return htmlTemplate;
};
