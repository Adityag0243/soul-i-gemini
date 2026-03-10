import dotenv from 'dotenv';
import { CookieOptions } from 'express';

dotenv.config();

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
    accessTokenValidity: parseInt(process.env.ACCESS_TOKEN_VALIDITY_SEC || '0'),
    refreshTokenValidity: parseInt(
        process.env.REFRESH_TOKEN_VALIDITY_SEC || '0',
    ),
    issuer: process.env.TOKEN_ISSUER || '',
    audience: process.env.TOKEN_AUDIENCE || '',
    jwtPrivateKey: process.env.JWT_PRIVATE_KEY || '',
    jwtPublicKey: process.env.JWT_PUBLIC_KEY || '',
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
