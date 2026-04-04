export const getPasswordResetOtpTemplate = (data: {
    name: string;
    otp: string;
    expiryMinutes: number;
    brandName: string;
    supportEmail: string;
}) => {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #1f2937;
            background-color: #f4f7fb;
            margin: 0;
            padding: 0;
        }
        .email-wrapper {
            max-width: 600px;
            margin: 24px auto;
            background-color: #ffffff;
            border-radius: 14px;
            overflow: hidden;
            box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
        }
        .header {
            background: linear-gradient(135deg, #0f766e 0%, #0ea5e9 100%);
            padding: 40px 24px;
            text-align: center;
            color: white;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
        }
        .content {
            padding: 40px 32px;
        }
        .greeting {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 16px;
        }
        .message {
            color: #4b5563;
            font-size: 14px;
            margin-bottom: 24px;
        }
        .otp-card {
            background: #f8fafc;
            border: 1px solid #dbeafe;
            border-radius: 12px;
            padding: 24px;
            text-align: center;
            margin: 24px 0;
        }
        .otp-label {
            color: #64748b;
            font-size: 13px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            margin-bottom: 10px;
        }
        .otp-code {
            font-size: 34px;
            letter-spacing: 0.28em;
            font-weight: 800;
            color: #0f766e;
            margin: 0;
        }
        .notice {
            background: #ecfeff;
            border-left: 4px solid #06b6d4;
            border-radius: 8px;
            padding: 14px 16px;
            color: #155e75;
            font-size: 13px;
            margin: 24px 0;
        }
        .footer {
            background-color: #f8fafc;
            padding: 24px 20px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
            font-size: 12px;
            color: #6b7280;
        }
        .footer p {
            margin: 6px 0;
        }
        .brand {
            font-weight: 700;
            color: #0f766e;
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="header">
            <h1>Password Reset Code</h1>
        </div>

        <div class="content">
            <div class="greeting">Hi ${data.name},</div>

            <div class="message">
                We received a request to reset the password for your ${data.brandName} account. Use the one-time code below in the app to continue.
            </div>

            <div class="otp-card">
                <div class="otp-label">Your OTP</div>
                <div class="otp-code">${data.otp}</div>
            </div>

            <div class="notice">
                This code expires in <strong>${data.expiryMinutes} minutes</strong>. If you did not request a password reset, you can ignore this email and your account will remain secure.
            </div>

            <div class="message">
                After the code is verified, you will be able to set a new password and sign in again immediately.
            </div>
        </div>

        <div class="footer">
            <p>This is an automated message, please do not reply directly to this email.</p>
            <p><span class="brand">${data.brandName}</span> support: ${data.supportEmail}</p>
        </div>
    </div>
</body>
</html>`;
};

export const getPasswordResetOtpTextTemplate = (data: {
    name: string;
    otp: string;
    expiryMinutes: number;
    brandName: string;
    supportEmail: string;
}) => {
    return `
Hi ${data.name},

We received a request to reset the password for your ${data.brandName} account.

Your one-time password (OTP) is: ${data.otp}

This code expires in ${data.expiryMinutes} minutes.

If you did not request this reset, you can ignore this email.

Support: ${data.supportEmail}
`;
};
