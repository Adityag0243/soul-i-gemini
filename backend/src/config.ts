import dotenv from 'dotenv';
import { CookieOptions } from 'express';
import fs from 'fs';
import path from 'path';

dotenv.config();

/** Read a PEM key: prefer env var, fallback to keys/ file */
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
export const port = process.env.PORT;

/** Base URL for the API (used by Swagger / Try it out). Must be http or https. */
export const serverUrl =
    process.env.SERVER_URL ||
    (port ? `http://localhost:${port}` : 'http://localhost:9090');

// JWT token configuration
export const tokenInfo = {
    accessTokenValidity: parseInt(
        process.env.ACCESS_TOKEN_VALIDITY_SEC || '900',
    ), // 15 minutes default
    refreshTokenValidity: parseInt(
        process.env.REFRESH_TOKEN_VALIDITY_SEC || '2592000', // 30 days default
    ),
    issuer: process.env.TOKEN_ISSUER || '',
    audience: process.env.TOKEN_AUDIENCE || '',
    jwtPrivateKey: readKey('JWT_PRIVATE_KEY', 'private.pem'),
    jwtPublicKey: readKey('JWT_PUBLIC_KEY', 'public.pem'),
};

// Cookie options
const cookieMaxAgeSeconds = Number(process.env.COOKIE_MAX_AGE_SEC ?? 3600000);
const cookieDomain = process.env.COOKIE_DOMAIN;

export const cookieOptions: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? ('none' as const) : ('strict' as const),
    maxAge: cookieMaxAgeSeconds,
    domain: isProduction ? cookieDomain : undefined,
    path: '/',
};

export const logDirectory = process.env.LOG_DIRECTORY;

export const dbUrl = process.env.DATABASE_URL ?? '';

// Google OAuth Configuration
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
