import dotenv from 'dotenv';
import { CookieOptions } from 'express';
import fs from 'fs';
import path from 'path';

dotenv.config();

function readKey(envVar: string, filename: string): string {
    const envValue = process.env[envVar];
    if (envValue) return envValue;
    const filePath = path.join(__dirname, '..', 'keys', filename);
    if (fs.existsSync(filePath))
        return fs.readFileSync(filePath, 'utf8').trim();
    return '';
}

export const originUrl = process.env.ORIGIN_URL;
export const isProduction = process.env.NODE_ENV === 'production';
export const timeZone = process.env.TZ;
export const port = parseInt(process.env.PORT || '5000', 10);

//the main serveing url : abhi deployed wala use mai hai
export const serverUrl = process.env.SERVER_URL
    ? 'https://souli.onrender.com'
    : process.env.SERVER_URL;

//token configuration
export const tokenInfo = {
    accessTokenValidity: parseInt(
        process.env.ACCESS_TOKEN_VALIDITY_SEC || '900',
        10,
    ), // 15 minutes default
    refreshTokenValidity: parseInt(
        process.env.REFRESH_TOKEN_VALIDITY_SEC || '2592000', // 30 days default
        10,
    ),
    issuer: process.env.TOKEN_ISSUER || '',
    audience: process.env.TOKEN_AUDIENCE || '',
    jwtPrivateKey: readKey('JWT_PRIVATE_KEY', 'private.pem'),
    jwtPublicKey: readKey('JWT_PUBLIC_KEY', 'public.pem'),
};

// cookie options
// const cookieMaxAgeSeconds = Number(process.env.COOKIE_MAX_AGE_SEC ?? 3600000);
const cookieMaxAgeMs = Number(process.env.COOKIE_MAX_AGE_SEC ?? 604800) * 1000;
const cookieDomain = process.env.COOKIE_DOMAIN;

export const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ('none' as const) : ('strict' as const),
    maxAge: cookieMaxAgeMs,
    domain: isProduction ? cookieDomain : undefined,
    path: '/',
};

export const logDirectory = process.env.LOG_DIRECTORY;

export const dbUrl = process.env.DATABASE_URL ?? '';

// google OAuth configuration
export const googleConfig = {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.CALLBACK_URL || '',
};

// AI Service Configuration (GCP Ollama)
export const aiServiceConfig = {
    serviceUrl: process.env.AI_SERVICE_URL || 'http://localhost:11434',
    model: process.env.AI_MODEL || 'llama3.2',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '2048'),
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
};

// LiveKit Voice Configuration
export const voiceConfig = {
    url: process.env.LIVEKIT_URL || '',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
    defaultRoom: process.env.LIVEKIT_ROOM || 'souli-room',
    tokenValiditySec: parseInt(process.env.LIVEKIT_TOKEN_VALIDITY_SEC || '900'),
};

// AWS SES Email Configuration
export const sesConfig = {
    awsRegion: process.env.AWS_REGION || 'ap-south-1',
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    fromEmail: process.env.FROM_EMAIL || 'noreply@souli.com',
    fromName: process.env.FROM_NAME || 'Souli',
};

// Payment Gateway Configuration
export const paymentConfig = {
    // Stripe
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    stripePdfEndpoint:
        process.env.STRIPE_PDF_ENDPOINT || 'https://api.stripe.com',

    // Razorpay
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',

    // Webhook
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',

    // subscription reminders - in days before expiry
    subscriptionReminderDays: parseInt(
        process.env.SUBSCRIPTION_REMINDER_DAYS || '7',
    ),
};

// configure SES for export (backward compatibility)
export const configS3 = {
    awsRegion: process.env.AWS_REGION || 'ap-south-1',
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
};
