export const getEmailVerificationOtpTemplate = (data: {
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
            padding: 32px 28px 24px;
        }
        .greeting {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 12px;
        }
        .message {
            font-size: 15px;
            color: #334155;
            margin-bottom: 24px;
        }
        .otp-card {
            background: #ecfeff;
            border: 1px solid #a5f3fc;
            border-radius: 12px;
            padding: 24px;
            text-align: center;
            margin-bottom: 24px;
        }
        .otp-label {
            font-size: 13px;
            color: #0e7490;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 8px;
        }
        .otp-code {
            font-size: 38px;
            font-weight: 700;
            letter-spacing: 6px;
            color: #0f766e;
            font-family: 'Courier New', monospace;
        }
        .notice {
            font-size: 14px;
            color: #475569;
            background: #f8fafc;
            border-left: 4px solid #0ea5e9;
            padding: 14px 16px;
            border-radius: 6px;
            margin-bottom: 20px;
        }
        .footer {
            background-color: #f1f5f9;
            padding: 20px;
            text-align: center;
            color: #64748b;
            font-size: 12px;
        }
        .footer p {
            margin: 4px 0;
        }
        .brand {
            color: #0f766e;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="header">
            <h1>Verify your email</h1>
        </div>

        <div class="content">
            <div class="greeting">Hi ${data.name},</div>

            <div class="message">
                Confirm this is your email for ${data.brandName} by entering the one-time code below in the app.
            </div>

            <div class="otp-card">
                <div class="otp-label">Verification Code</div>
                <div class="otp-code">${data.otp}</div>
            </div>

            <div class="notice">
                This code expires in <strong>${data.expiryMinutes} minutes</strong>. If you did not request verification, you can ignore this email.
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

export const getEmailVerificationOtpTextTemplate = (data: {
    name: string;
    otp: string;
    expiryMinutes: number;
    brandName: string;
    supportEmail: string;
}) => {
    return `
Hi ${data.name},

Confirm this is your email for ${data.brandName}.

Your verification code is: ${data.otp}

This code expires in ${data.expiryMinutes} minutes.

If you did not request verification, you can ignore this email.

Support: ${data.supportEmail}
`;
};
