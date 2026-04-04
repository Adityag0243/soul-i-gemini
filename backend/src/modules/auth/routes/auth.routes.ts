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
    anonymousLoginSchema,
    souliKeyRestoreSchema,
    forgotPasswordRequestSchema,
    forgotPasswordVerifySchema,
    forgotPasswordResetSchema,
} from '../schemas/auth.schema';
import * as AuthController from '../controllers/auth.controller';

const router = Router();

//swagger documentation

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

// anonymous login
router.post(
    '/anonymous',
    validator(anonymousLoginSchema, ValidationSource.BODY),
    asyncHandler(AuthController.anonymousLogin),
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

router.get(
    '/providers',
    authMiddleware as unknown as RequestHandler,
    asyncHandler(AuthController.getProviders),
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

export default router;
