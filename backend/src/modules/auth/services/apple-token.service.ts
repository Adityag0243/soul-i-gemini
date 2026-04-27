import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { appleConfig } from '../../../config';
import {
    AuthFailureError,
    BadRequestError,
    InternalError,
} from '../../../core/api-error';
import logger from '../../../core/logger';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const JWKS_TTL_MS = 24 * 60 * 60 * 1000; // 24h — Apple's keys rotate slowly

interface AppleJwk {
    kty: string;
    kid: string;
    use: string;
    alg: string;
    n: string;
    e: string;
}

interface ApplePayload extends JwtPayload {
    sub: string;
    email?: string;
    email_verified?: string | boolean;
    is_private_email?: string | boolean;
    nonce?: string;
    nonce_supported?: boolean;
}

export interface AppleUserPayload {
    sub: string;
    email?: string;
    emailVerified: boolean;
    isPrivateEmail: boolean;
}

let cachedJwks: { keys: AppleJwk[]; fetchedAt: number } | null = null;

async function fetchJwks(): Promise<AppleJwk[]> {
    if (cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_TTL_MS) {
        return cachedJwks.keys;
    }

    const res = await fetch(APPLE_JWKS_URL);
    if (!res.ok) {
        logger.error('Apple JWKS fetch failed', {
            status: res.status,
            statusText: res.statusText,
        });
        throw new AuthFailureError('Unable to verify Apple identity');
    }
    const body = (await res.json()) as { keys: AppleJwk[] };
    cachedJwks = { keys: body.keys, fetchedAt: Date.now() };
    return body.keys;
}

function jwkToPem(jwk: AppleJwk): string {
    const publicKey = crypto.createPublicKey({
        key: jwk as unknown as crypto.JsonWebKey,
        format: 'jwk',
    });
    return publicKey.export({ format: 'pem', type: 'spki' }) as string;
}

// Apple's contract: if the client supplied a nonce when authorizing, Apple puts
// the SHA-256 hash of that nonce into the JWT's `nonce` claim. iOS native
// implementations sometimes pre-hash (so the JWT contains the raw value).
// Accept either form rather than insist on one.
function nonceMatches(claimNonce: string, providedNonce: string): boolean {
    if (claimNonce === providedNonce) return true;
    const hash = crypto
        .createHash('sha256')
        .update(providedNonce)
        .digest('hex');
    return claimNonce === hash;
}

export async function verifyAppleIdentityToken(
    identityToken: string,
    opts: { nonce?: string } = {},
): Promise<AppleUserPayload> {
    const audiences = [appleConfig.bundleId, appleConfig.serviceId].filter(
        Boolean,
    );
    if (audiences.length === 0) {
        logger.error(
            'Apple Sign In is not configured — APPLE_BUNDLE_ID/APPLE_SERVICE_ID missing',
        );
        throw new InternalError('Apple Sign In is not configured');
    }

    const decoded = jwt.decode(identityToken, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
        throw new AuthFailureError('Invalid Apple identity token');
    }
    if (decoded.header.alg !== 'RS256') {
        throw new AuthFailureError('Unsupported Apple token algorithm');
    }

    const jwks = await fetchJwks();
    const jwk = jwks.find((k) => k.kid === decoded.header.kid);
    if (!jwk) {
        throw new AuthFailureError('Apple signing key not recognised');
    }

    let payload: ApplePayload;
    try {
        const verified = jwt.verify(identityToken, jwkToPem(jwk), {
            algorithms: ['RS256'],
            issuer: APPLE_ISSUER,
            audience: audiences as [string, ...string[]],
        });
        if (typeof verified === 'string') {
            throw new AuthFailureError('Invalid Apple identity token');
        }
        payload = verified as ApplePayload;
    } catch (err) {
        logger.warn('Apple identity token verification failed', {
            error: err instanceof Error ? err.message : 'unknown',
        });
        throw new AuthFailureError('Invalid Apple identity token');
    }

    if (opts.nonce) {
        if (!payload.nonce || !nonceMatches(payload.nonce, opts.nonce)) {
            throw new BadRequestError('Apple nonce mismatch');
        }
    }

    if (!payload.sub) {
        throw new AuthFailureError('Invalid Apple identity token');
    }

    const emailVerified =
        payload.email_verified === true || payload.email_verified === 'true';
    const isPrivateEmail =
        payload.is_private_email === true ||
        payload.is_private_email === 'true';

    return {
        sub: payload.sub,
        email: payload.email,
        emailVerified,
        isPrivateEmail,
    };
}
