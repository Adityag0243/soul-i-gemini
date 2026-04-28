import { Router, RequestHandler } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import { validator } from '../../../middlewares/validator.middleware';
import { ValidationSource } from '../../../helpers/validator';
import authMiddleware from '../../../middlewares/auth.middleware';
import { registry } from '../../../swagger-docs/swagger';
import {
    emailRegisterSchema,
    emailLoginSchema,
    googleLoginSchema,
    appleLoginSchema,
    anonymousLoginSchema,
    authRequestSchema,
    refreshTokenSchema,
    souliKeyRestoreSchema,
    forgotPasswordRequestSchema,
    forgotPasswordVerifySchema,
    forgotPasswordResetSchema,
    legacyResetPasswordSchema,
    emailVerifyConfirmSchema,
    mobileOtpSendSchema,
    mobileOtpVerifySchema,
    resetJourneySchema,
    eraseAllDataSchema,
} from '../schemas/auth.schema';
import * as AuthController from '../controllers/auth.controller';

const router = Router();

//swagger documentation

registry.registerPath({
    method: 'post',
    path: '/auth/refresh',
    summary: 'Refresh tokens',
    description:
        'Exchange a valid refresh token for a new access+refresh pair. Send refresh token in body or cookies and access token in Authorization header or cookies. Old refresh token is revoked on success.',
    tags: ['Auth'],
    security: [{ apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: refreshTokenSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'New tokens issued',
        },
        401: {
            description: 'Invalid or expired tokens',
        },
        403: {
            description: 'Missing or invalid API key',
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/token/refresh',
    summary: '[Legacy] Refresh tokens',
    description:
        'Legacy alias for POST /auth/refresh — same behavior. Kept for 1 release while mobile migrates.',
    tags: ['Auth'],
    security: [{ apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: refreshTokenSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'New tokens issued',
        },
        401: {
            description: 'Invalid or expired tokens',
        },
        403: {
            description: 'Missing or invalid API key',
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/email/register',
    summary: 'Register with Email',
    description:
        'Create a new user account with email and password. Returns user data and JWT tokens.',
    tags: ['Auth'],
    security: [{ apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: emailRegisterSchema,
                },
            },
        },
    },
    responses: {
        201: { description: 'User created successfully' },
        400: { description: 'Validation error or user already registered' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/email/login',
    summary: 'Login with Email',
    description:
        'Authenticate with email and password. Returns user data and JWT tokens.',
    tags: ['Auth'],
    security: [{ apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: emailLoginSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Login successful' },
        400: { description: 'Validation error' },
        401: { description: 'Invalid credentials' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/google',
    summary: 'Login/Register with Google',
    description:
        'Authenticate using Google ID token. Creates account if not exists. Returns user data and JWT tokens.',
    tags: ['Auth'],
    security: [{ apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: googleLoginSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Login successful' },
        400: { description: 'Validation error' },
        401: { description: 'Invalid Google token' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/apple',
    summary: 'Login/Register with Apple',
    description:
        'Authenticate using an Apple identity token. Verified against Apple JWKs. fullName is only sent on first authorization (Apple contract). Returns user + JWT tokens.',
    tags: ['Auth'],
    security: [{ apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: appleLoginSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Login successful' },
        400: { description: 'Apple nonce mismatch or validation error' },
        401: { description: 'Invalid Apple identity token' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/anonymous',
    summary: 'Anonymous Login',
    description:
        'Create an anonymous account. Returns a Souli Key that must be saved to restore the session later.',
    tags: ['Auth'],
    security: [{ apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: anonymousLoginSchema,
                },
            },
        },
    },
    responses: {
        201: { description: 'Anonymous account created with Souli Key' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/restore',
    summary: 'Restore Session with Souli Key',
    description:
        'Restore an anonymous session using the Souli Key provided during anonymous registration.',
    tags: ['Auth'],
    security: [{ apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: souliKeyRestoreSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Session restored successfully' },
        401: { description: 'Invalid Souli Key' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/link/google',
    summary: 'Link Google Account',
    description:
        'Link a Google account to the current user. Requires authentication.',
    tags: ['Auth'],
    security: [{ apiKey: [], bearerAuth: [] }],
    responses: {
        200: { description: 'Google account linked successfully' },
        400: { description: 'Account already linked' },
        401: { description: 'Invalid credentials' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/link/apple',
    summary: 'Link Apple Account',
    description:
        'Link an Apple account to the current user. Same body as /auth/apple. Requires authentication.',
    tags: ['Auth'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: appleLoginSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Apple account linked successfully' },
        400: { description: 'Account already linked or nonce mismatch' },
        401: { description: 'Invalid Apple identity token' },
        409: { description: 'Apple account belongs to another user' },
    },
});

registry.registerPath({
    method: 'get',
    path: '/auth/providers',
    summary: 'Get Linked Providers',
    description: 'Get all authentication providers linked to the current user.',
    tags: ['Auth'],
    security: [{ apiKey: [], bearerAuth: [] }],
    responses: {
        200: { description: 'Providers list retrieved' },
        401: { description: 'Authentication required' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/privacy/reset-journey',
    summary: 'Reset Journey',
    description:
        'Delete chat, emotional, crisis, feedback, and analytics data while keeping the account active.',
    tags: ['Auth - Privacy'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: resetJourneySchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Journey reset successfully' },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'delete',
    path: '/auth/privacy/erase-all',
    summary: 'Erase All Data',
    description:
        'Cancel active subscriptions, revoke sessions, and permanently delete the account and linked data.',
    tags: ['Auth - Privacy'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: eraseAllDataSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Account and data erased successfully' },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/password/forgot',
    summary: 'Request Forgot Password OTP',
    description:
        'Send a 6 digit OTP to the user email for password reset. Returns a generic success response.',
    tags: ['Auth'],
    security: [{ apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: forgotPasswordRequestSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'OTP sent successfully' },
        400: { description: 'Validation error' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/password/forgot/verify',
    summary: 'Verify Forgot Password OTP',
    description:
        'Verify the OTP sent to email and return a short-lived reset token used to complete the password change.',
    tags: ['Auth'],
    security: [{ apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: forgotPasswordVerifySchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'OTP verified successfully' },
        400: { description: 'Validation error' },
        401: { description: 'Invalid or expired OTP' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/password/forgot/reset',
    summary: 'Reset Password',
    description:
        'Set a new password after OTP verification using the reset token returned by the verify step.',
    tags: ['Auth'],
    security: [{ apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: forgotPasswordResetSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Password reset successfully' },
        400: { description: 'Validation error' },
        401: { description: 'Invalid or expired reset token' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/forgot-password',
    summary: '[Legacy] Forgot Password',
    description:
        'Legacy alias for POST /auth/password/forgot — same body and response. Kept for 1 release while mobile migrates (D7).',
    tags: ['Auth'],
    security: [{ apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: forgotPasswordRequestSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'OTP sent successfully' },
        400: { description: 'Validation error' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/reset-password',
    summary: '[Legacy] Reset Password (single-shot)',
    description:
        'Legacy single-shot alias that takes { email, otp, newPassword, confirmPassword } and chains the 3-step flow internally. Kept for 1 release (D7).',
    tags: ['Auth'],
    security: [{ apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: legacyResetPasswordSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Password reset successfully' },
        400: { description: 'Validation error' },
        401: { description: 'Invalid or expired OTP' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/email/verify/send',
    summary: 'Send email verification OTP',
    description:
        'Sends a 6-digit verification OTP to User.email. Throttled at 3 sends per hour per userId. Auth required.',
    tags: ['Auth'],
    security: [{ bearerAuth: [] }, { apiKey: [] }],
    responses: {
        200: { description: 'Verification email sent' },
        400: { description: 'Email already verified or no email on file' },
        401: { description: 'Unauthorized' },
        429: { description: 'Rate limit exceeded' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/mobile/otp/send',
    summary: 'Send mobile OTP',
    description:
        'Sends a 6-digit OTP via SMS for `intent=login` (unauthenticated) or `intent=link` (auth required). Returns `requestId` to pass to /verify. Throttled at 5 sends per hour per mobile number; 60-second resend cooldown.',
    tags: ['Auth'],
    security: [{ apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: mobileOtpSendSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'OTP sent' },
        400: { description: 'Validation or already-linked-elsewhere' },
        401: { description: 'intent=link without Authorization' },
        429: { description: 'Rate limit or resend cooldown' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/mobile/otp/verify',
    summary: 'Verify mobile OTP',
    description:
        'Verifies the OTP for the given `requestId`. On success: `intent=login` returns the standard auth payload (creating the user on first verify); `intent=link` returns `{ linked: true }`. After 5 wrong tries, returns 429.',
    tags: ['Auth'],
    security: [{ apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: mobileOtpVerifySchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Login or link succeeded' },
        400: { description: 'Validation error' },
        401: { description: 'Invalid or expired OTP' },
        429: { description: 'Too many wrong attempts' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/email/verify/confirm',
    summary: 'Confirm email verification OTP',
    description:
        'Confirms the OTP from /auth/email/verify/send and marks the email verified. Returns the updated user.',
    tags: ['Auth'],
    security: [{ bearerAuth: [] }, { apiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: emailVerifyConfirmSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Email verified' },
        400: { description: 'Validation error' },
        401: { description: 'Unauthorized or OTP invalid/expired' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/logout',
    summary: 'Logout (current session)',
    description:
        'Revoke the current keystore session (this device only). Clears auth cookies.',
    tags: ['Auth'],
    security: [{ bearerAuth: [], apiKey: [] }],
    responses: {
        200: { description: 'Logged out' },
        401: { description: 'Authentication required' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/auth/logout-all',
    summary: 'Logout all sessions',
    description:
        'Revoke ALL active keystore sessions for this user (all devices). Clears auth cookies.',
    tags: ['Auth'],
    security: [{ bearerAuth: [], apiKey: [] }],
    responses: {
        200: { description: 'All sessions revoked' },
        401: { description: 'Authentication required' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'get',
    path: '/auth/sessions',
    summary: 'List active sessions',
    description:
        'List all active keystore sessions for this user. Each entry includes isCurrent flag and optional device metadata.',
    tags: ['Auth'],
    security: [{ bearerAuth: [], apiKey: [] }],
    responses: {
        200: { description: 'Sessions list retrieved' },
        401: { description: 'Authentication required' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'delete',
    path: '/auth/sessions/{keystoreId}',
    summary: 'Revoke a specific session',
    description:
        'Revoke a specific keystore session by ID. Cannot revoke the current session — use /auth/logout for that.',
    tags: ['Auth'],
    security: [{ bearerAuth: [], apiKey: [] }],
    responses: {
        200: { description: 'Session revoked' },
        400: { description: 'Cannot revoke current session' },
        401: { description: 'Authentication required' },
        404: { description: 'Session not found' },
    },
});

// routes

//register
router.post(
    '/email/register',
    validator(emailRegisterSchema, ValidationSource.BODY),
    asyncHandler(AuthController.emailRegister),
);

//login
router.post(
    '/email/login',
    validator(emailLoginSchema, ValidationSource.BODY),
    asyncHandler(AuthController.emailLogin),
);

// google login/register
router.post(
    '/google',
    validator(googleLoginSchema, ValidationSource.BODY),
    asyncHandler(AuthController.googleLogin),
);

// apple login/register
router.post(
    '/apple',
    validator(appleLoginSchema, ValidationSource.BODY),
    asyncHandler(AuthController.appleLogin),
);

// anonymous login
router.post(
    '/anonymous',
    validator(anonymousLoginSchema, ValidationSource.BODY),
    asyncHandler(AuthController.anonymousLogin),
);

// refresh token pair (canonical path)
router.post(
    '/refresh',
    validator(authRequestSchema, ValidationSource.REQUEST),
    validator(refreshTokenSchema, ValidationSource.REQUEST),
    asyncHandler(AuthController.refreshTokens),
);

// legacy alias — kept for 1 release while mobile migrates
router.post(
    '/token/refresh',
    validator(authRequestSchema, ValidationSource.REQUEST),
    validator(refreshTokenSchema, ValidationSource.REQUEST),
    asyncHandler(AuthController.refreshTokens),
);

// restore with souli key
router.post(
    '/restore',
    validator(souliKeyRestoreSchema, ValidationSource.BODY),
    asyncHandler(AuthController.souliKeyRestore),
);

// protected routes
router.post(
    '/link/google',
    authMiddleware as unknown as RequestHandler,
    validator(googleLoginSchema, ValidationSource.BODY),
    asyncHandler(AuthController.linkGoogle),
);

router.post(
    '/link/apple',
    authMiddleware as unknown as RequestHandler,
    validator(appleLoginSchema, ValidationSource.BODY),
    asyncHandler(AuthController.linkApple),
);

router.get(
    '/providers',
    authMiddleware as unknown as RequestHandler,
    asyncHandler(AuthController.getProviders),
);

router.post(
    '/logout',
    authMiddleware as unknown as RequestHandler,
    asyncHandler(AuthController.logout),
);

router.post(
    '/logout-all',
    authMiddleware as unknown as RequestHandler,
    asyncHandler(AuthController.logoutAll),
);

router.get(
    '/sessions',
    authMiddleware as unknown as RequestHandler,
    asyncHandler(AuthController.getSessions),
);

router.delete(
    '/sessions/:keystoreId',
    authMiddleware as unknown as RequestHandler,
    asyncHandler(AuthController.revokeSession),
);

router.post(
    '/privacy/reset-journey',
    authMiddleware as unknown as RequestHandler,
    validator(resetJourneySchema, ValidationSource.BODY),
    asyncHandler(AuthController.resetJourney),
);

router.delete(
    '/privacy/erase-all',
    authMiddleware as unknown as RequestHandler,
    validator(eraseAllDataSchema, ValidationSource.BODY),
    asyncHandler(AuthController.eraseAllData),
);

router.post(
    '/password/forgot',
    validator(forgotPasswordRequestSchema, ValidationSource.BODY),
    asyncHandler(AuthController.requestForgotPasswordOtp),
);

router.post(
    '/password/forgot/verify',
    validator(forgotPasswordVerifySchema, ValidationSource.BODY),
    asyncHandler(AuthController.verifyForgotPasswordOtp),
);

router.post(
    '/password/forgot/reset',
    validator(forgotPasswordResetSchema, ValidationSource.BODY),
    asyncHandler(AuthController.resetForgotPassword),
);

// Legacy aliases (D7 — kept for 1 release while mobile migrates)
router.post(
    '/forgot-password',
    validator(forgotPasswordRequestSchema, ValidationSource.BODY),
    asyncHandler(AuthController.requestForgotPasswordOtp),
);

router.post(
    '/reset-password',
    validator(legacyResetPasswordSchema, ValidationSource.BODY),
    asyncHandler(AuthController.legacyResetPassword),
);

// Email verification (Phase 4.2)
router.post(
    '/email/verify/send',
    authMiddleware as unknown as RequestHandler,
    asyncHandler(AuthController.sendEmailVerificationOtp),
);

router.post(
    '/email/verify/confirm',
    authMiddleware as unknown as RequestHandler,
    validator(emailVerifyConfirmSchema, ValidationSource.BODY),
    asyncHandler(AuthController.confirmEmailVerification),
);

// Mobile OTP (Phase 4.3) — auth is optional; controller resolves it with
// tryGetUserIdFromToken since the same route handles login (no auth) and
// link (auth required).
router.post(
    '/mobile/otp/send',
    validator(mobileOtpSendSchema, ValidationSource.BODY),
    asyncHandler(AuthController.sendMobileOtp),
);

router.post(
    '/mobile/otp/verify',
    validator(mobileOtpVerifySchema, ValidationSource.BODY),
    asyncHandler(AuthController.verifyMobileOtp),
);

export default router;
