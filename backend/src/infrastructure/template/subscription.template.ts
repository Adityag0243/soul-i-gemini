// ============ Subscription Confirmation Email ============

export const getSubscriptionConfirmationTemplate = (data: {
    userName: string;
    planName: string;
    amount: number;
    currency: string;
    startDate: string;
    endDate: string;
    features: string[];
}) => {
    const featuresList = data.features.map((f) => `<li>${f}</li>`).join('\n');

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
        .plan-box {
            background: #f9f9f9;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .plan-name {
            font-size: 24px;
            color: #667eea;
            font-weight: 600;
            margin-bottom: 10px;
        }
        .price-info {
            font-size: 14px;
            color: #666;
            margin-bottom: 15px;
        }
        .features {
            list-style: none;
            padding: 0;
            margin: 15px 0;
        }
        .features li {
            padding: 8px 0;
            padding-left: 25px;
            position: relative;
            color: #555;
        }
        .features li:before {
            content: "✓";
            position: absolute;
            left: 0;
            color: #4caf50;
            font-weight: bold;
        }
        .date-section {
            margin: 25px 0;
            padding: 15px;
            background: #e8f5e9;
            border-radius: 4px;
        }
        .date-section h3 {
            margin: 0 0 10px 0;
            color: #2e7d32;
        }
        .button-container {
            text-align: center;
            margin: 30px 0;
        }
        .button {
            display: inline-block;
            padding: 12px 40px;
            background: #667eea;
            color: white;
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
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="header">
            <h1>Subscription Confirmed!</h1>
        </div>
        <div class="content">
            <p class="greeting">Hi ${data.userName},</p>
            <p>Great! Your subscription to Souli has been confirmed. You now have access to all premium features.</p>

            <div class="plan-box">
                <div class="plan-name">${data.planName}</div>
                <div class="price-info">
                    <strong>Amount:</strong> ${data.currency} ${data.amount.toFixed(2)}<br>
                </div>

                <h3 style="margin-top: 15px; color: #333;">Your Features:</h3>
                <ul class="features">
                    ${featuresList}
                </ul>
            </div>

            <div class="date-section">
                <h3>Subscription Details</h3>
                <p><strong>Start Date:</strong> ${data.startDate}</p>
                <p><strong>End Date:</strong> ${data.endDate}</p>
                <p style="color: #2e7d32; margin-top: 10px;">Your subscription will automatically renew on ${data.endDate}</p>
            </div>

            <p style="color: #666; margin-top: 25px;">
                You can manage your subscription, view invoices, and update payment methods from your account dashboard.
            </p>

            <div class="button-container">
                <a href="${process.env.ORIGIN_URL}/account/subscriptions" class="button">View Subscription</a>
            </div>

            <p style="color: #999; font-size: 12px; margin-top: 20px;">
                If you have any questions, please don't hesitate to reach out to our support team.
            </p>
        </div>
        <div class="footer">
            <p><strong>Souli</strong></p>
            <p>${process.env.FROM_EMAIL}</p>
            <p>© ${new Date().getFullYear()} Souli. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
`;
};

// ============ Subscription Renewal Reminder Email ============

export const getSubscriptionReminderTemplate = (data: {
    userName: string;
    planName: string;
    amount: number;
    currency: string;
    expiryDate: string;
    daysRemaining: number;
}) => {
    const urgencyLevel =
        data.daysRemaining <= 3
            ? 'high'
            : data.daysRemaining <= 7
              ? 'medium'
              : 'low';
    const bgColor =
        urgencyLevel === 'high'
            ? '#ffebee'
            : urgencyLevel === 'medium'
              ? '#fff3e0'
              : '#e8f5e9';
    const borderColor =
        urgencyLevel === 'high'
            ? '#c62828'
            : urgencyLevel === 'medium'
              ? '#f57f17'
              : '#2e7d32';
    const textColor =
        urgencyLevel === 'high'
            ? '#b71c1c'
            : urgencyLevel === 'medium'
              ? '#e65100'
              : '#2e7d32';

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
            background: linear-gradient(135deg, #ff9800 0%, #f57f17 100%);
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
        .reminder-box {
            background: ${bgColor};
            border-left: 4px solid ${borderColor};
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .reminder-title {
            font-size: 18px;
            color: ${textColor};
            font-weight: 600;
            margin-bottom: 10px;
        }
        .countdown {
            font-size: 32px;
            color: ${textColor};
            font-weight: bold;
            text-align: center;
            margin: 20px 0;
        }
        .countdown-label {
            font-size: 14px;
            color: ${textColor};
            text-align: center;
            margin-bottom: 20px;
        }
        .plan-info {
            background: #f9f9f9;
            padding: 15px;
            border-radius: 4px;
            margin: 15px 0;
        }
        .plan-info p {
            margin: 8px 0;
            font-size: 14px;
        }
        .button-container {
            text-align: center;
            margin: 30px 0;
        }
        .button {
            display: inline-block;
            padding: 12px 40px;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            transition: transform 0.2s;
            margin: 0 10px;
        }
        .button:hover {
            transform: translateY(-2px);
        }
        .button-cancel {
            background: #e74c3c;
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
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="header">
            <h1>Subscription Expiring Soon!</h1>
        </div>
        <div class="content">
            <p class="greeting">Hi ${data.userName},</p>

            <div class="reminder-box">
                <div class="reminder-title">Your ${data.planName} subscription expires in:</div>
                <div class="countdown">${data.daysRemaining} Days</div>
                <div class="countdown-label">Expires on ${data.expiryDate}</div>
            </div>

            <div class="plan-info">
                <p><strong>Plan:</strong> ${data.planName}</p>
                <p><strong>Amount:</strong> ${data.currency} ${data.amount.toFixed(2)}</p>
                <p><strong>Renewal Date:</strong> ${data.expiryDate}</p>
            </div>

            <p style="color: #666; margin-top: 20px;">
                ${
                    data.daysRemaining <= 3
                        ? 'Your subscription is expiring very soon! Once it expires, you will lose access to premium features.'
                        : 'Your subscription will expire soon. Make sure to renew it to continue enjoying our premium services.'
                }
            </p>

            <div class="button-container">
                <a href="${process.env.ORIGIN_URL}/account/subscriptions/renew" class="button">Renew Subscription</a>
                <a href="${process.env.ORIGIN_URL}/account/subscriptions/cancel" class="button button-cancel">Cancel</a>
            </div>

            <p style="color: #999; font-size: 12px; margin-top: 20px;">
                Need help? Contact our support team at ${process.env.FROM_EMAIL}
            </p>
        </div>
        <div class="footer">
            <p><strong>Souli</strong></p>
            <p>${process.env.FROM_EMAIL}</p>
            <p>© ${new Date().getFullYear()} Souli. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
`;
};

// ============ Subscription Cancelled Email ============

export const getSubscriptionCancelledTemplate = (data: {
    userName: string;
    planName: string;
    cancelledDate: string;
    feedback?: string;
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
            background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%);
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
        .info-box {
            background: #ffebee;
            border-left: 4px solid #c62828;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .button-container {
            text-align: center;
            margin: 30px 0;
        }
        .button {
            display: inline-block;
            padding: 12px 40px;
            background: #667eea;
            color: white;
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
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="header">
            <h1>Subscription Cancelled</h1>
        </div>
        <div class="content">
            <p class="greeting">Hi ${data.userName},</p>
            <p>We're sorry to see you go! Your ${data.planName} subscription has been successfully cancelled.</p>

            <div class="info-box">
                <p><strong>Plan:</strong> ${data.planName}</p>
                <p><strong>Cancellation Date:</strong> ${data.cancelledDate}</p>
                <p style="color: #c62828; margin-top: 15px;">You will lose access to premium features immediately.</p>
            </div>

            <p style="color: #666; margin-top: 20px;">
                We value your feedback! If you'd like to tell us why you're cancelling, please reply to this email or visit our feedback page.
            </p>

            <p style="color: #666;">
                You can resubscribe to any plan at any time from your account dashboard.
            </p>

            <div class="button-container">
                <a href="${process.env.ORIGIN_URL}/account/subscriptions" class="button">View Plans</a>
            </div>

            <p style="color: #999; font-size: 12px; margin-top: 20px;">
                If you have any questions or need assistance, please contact our support team at ${process.env.FROM_EMAIL}
            </p>
        </div>
        <div class="footer">
            <p><strong>Souli</strong></p>
            <p>${process.env.FROM_EMAIL}</p>
            <p>© ${new Date().getFullYear()} Souli. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
`;
};

// ============ Payment Failed Email ============

export const getPaymentFailedTemplate = (data: {
    userName: string;
    amount: number;
    currency: string;
    reason: string;
    paymentId: string;
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
            background: linear-gradient(135deg, #f57f17 0%, #ff9800 100%);
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
        .error-box {
            background: #fff3e0;
            border-left: 4px solid #f57f17;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .error-box h3 {
            margin-top: 0;
            color: #e65100;
        }
        .button-container {
            text-align: center;
            margin: 30px 0;
        }
        .button {
            display: inline-block;
            padding: 12px 40px;
            background: #667eea;
            color: white;
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
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="header">
            <h1>Payment Failed</h1>
        </div>
        <div class="content">
            <p class="greeting">Hi ${data.userName},</p>
            <p>Your recent payment couldn't be processed. Here are the details:</p>

            <div class="error-box">
                <h3>Payment Details</h3>
                <p><strong>Amount:</strong> ${data.currency} ${data.amount.toFixed(2)}</p>
                <p><strong>Payment ID:</strong> ${data.paymentId}</p>
                <p><strong>Reason:</strong> ${data.reason}</p>
            </div>

            <p style="color: #666; margin-top: 20px;">
                Please try again with a different payment method or contact your bank for more information.
            </p>

            <div class="button-container">
                <a href="${process.env.ORIGIN_URL}/account/subscriptions/retry-payment" class="button">Retry Payment</a>
            </div>

            <p style="color: #999; font-size: 12px; margin-top: 20px;">
                If you continue to experience issues, please contact our support team at ${process.env.FROM_EMAIL}
            </p>
        </div>
        <div class="footer">
            <p><strong>Souli</strong></p>
            <p>${process.env.FROM_EMAIL}</p>
            <p>© ${new Date().getFullYear()} Souli. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
`;
};

// ============ Payment Success Email (Invoice) ============

export const getPaymentSuccessTemplate = (data: {
    userName: string;
    userEmail: string;
    transactionId: string;
    amount: number;
    currency: string;
    planName: string;
    startDate: string;
    endDate: string;
    paymentMethod: string;
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
            background: linear-gradient(135deg, #4caf50 0%, #2e7d32 100%);
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
        .receipt-box {
            background: #f9f9f9;
            border: 1px solid #e0e0e0;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
        }
        .receipt-header {
            border-bottom: 2px solid #4caf50;
            padding-bottom: 15px;
            margin-bottom: 15px;
        }
        .receipt-header h2 {
            margin: 0;
            color: #4caf50;
            font-size: 18px;
        }
        .receipt-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #eeeeee;
        }
        .receipt-row.total {
            font-weight: bold;
            border-top: 2px solid #4caf50;
            border-bottom: none;
            font-size: 16px;
            color: #4caf50;
            margin-top: 10px;
            padding-top: 15px;
        }
        .receipt-row:last-child {
            border-bottom: none;
        }
        .button-container {
            text-align: center;
            margin: 30px 0;
        }
        .button {
            display: inline-block;
            padding: 12px 40px;
            background: #667eea;
            color: white;
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
    </style>
</head>
<body>
    <div class="email-wrapper">
        <div class="header">
            <h1>Payment Received ✓</h1>
        </div>
        <div class="content">
            <p style="font-size: 16px; color: #333;">Thank you for your payment, ${data.userName}!</p>

            <div class="receipt-box">
                <div class="receipt-header">
                    <h2>Invoice Receipt</h2>
                </div>
                <div class="receipt-row">
                    <span><strong>Transaction ID:</strong></span>
                    <span>${data.transactionId}</span>
                </div>
                <div class="receipt-row">
                    <span><strong>Plan:</strong></span>
                    <span>${data.planName}</span>
                </div>
                <div class="receipt-row">
                    <span><strong>Valid From:</strong></span>
                    <span>${data.startDate}</span>
                </div>
                <div class="receipt-row">
                    <span><strong>Valid Until:</strong></span>
                    <span>${data.endDate}</span>
                </div>
                <div class="receipt-row">
                    <span><strong>Payment Method:</strong></span>
                    <span>${data.paymentMethod}</span>
                </div>
                <div class="receipt-row total">
                    <span>TOTAL AMOUNT:</span>
                    <span>${data.currency} ${data.amount.toFixed(2)}</span>
                </div>
            </div>

            <p style="color: #666; margin-top: 20px;">
                Your subscription is now active. You can start enjoying all premium features immediately.
            </p>

            <div class="button-container">
                <a href="${process.env.ORIGIN_URL}/app" class="button">Start Using Souli</a>
            </div>

            <p style="color: #999; font-size: 12px; margin-top: 20px;">
                Keep this email for your records. You can download an invoice from your account dashboard.
            </p>
        </div>
        <div class="footer">
            <p><strong>Souli</strong></p>
            <p>${data.userEmail}</p>
            <p>© ${new Date().getFullYear()} Souli. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
`;
};
