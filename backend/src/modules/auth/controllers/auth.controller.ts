import { Request, Response } from 'express';
import {
    SuccessResponse,
    SuccessCreatedResponse,
} from '../../../core/api-response';
import { setCookies } from '../../../core/cookie-utils';
import { ProtectedRequest } from '../../../types/app-requests';
import AuthService from '../services/auth.service';
import {
    EmailRegisterInput,
    EmailLoginInput,
    GoogleLoginInput,
    AnonymousLoginInput,
    SouliKeyRestoreInput,
} from '../schemas/auth.schema';

/**
 * Register with email and password
 * POST /auth/email/register
 */
export async function emailRegister(
    req: Request<object, object, EmailRegisterInput>,
    res: Response,
): Promise<void> {
    const result = await AuthService.registerWithEmail(req.body);

    // Set cookies for web clients
    setCookies(res, result.tokens);

    new SuccessCreatedResponse('Registration successful', {
        user: result.user,
        tokens: result.tokens,
    }).send(res);
}

/**
 * Login with email and password
 * POST /auth/email/login
 */
export async function emailLogin(
    req: Request<object, object, EmailLoginInput>,
    res: Response,
): Promise<void> {
    const result = await AuthService.loginWithEmail(req.body);

    // Set cookies for web clients
    setCookies(res, result.tokens);

    new SuccessResponse('Login successful', {
        user: result.user,
        tokens: result.tokens,
    }).send(res);
}

/**
 * Login/Register with Google
 * POST /auth/google
 */
export async function googleLogin(
    req: Request<object, object, GoogleLoginInput>,
    res: Response,
): Promise<void> {
    const result = await AuthService.loginWithGoogle(req.body);

    // Set cookies for web clients
    setCookies(res, result.tokens);

    new SuccessResponse('Google login successful', {
        user: result.user,
        tokens: result.tokens,
    }).send(res);
}

/**
 * Anonymous login - creates new anonymous user
 * POST /auth/anonymous
 */
export async function anonymousLogin(
    req: Request<object, object, AnonymousLoginInput>,
    res: Response,
): Promise<void> {
    const result = await AuthService.loginAnonymous(req.body);

    // Set cookies for web clients
    setCookies(res, result.tokens);

    new SuccessCreatedResponse('Anonymous account created', {
        user: result.user,
        tokens: result.tokens,
        souliKey: result.souliKey, // Important: User must save this key!
    }).send(res);
}

/**
 * Restore session with Souli Key
 * POST /auth/restore
 */
export async function souliKeyRestore(
    req: Request<object, object, SouliKeyRestoreInput>,
    res: Response,
): Promise<void> {
    const result = await AuthService.restoreWithSouliKey(req.body);

    // Set cookies for web clients
    setCookies(res, result.tokens);

    new SuccessResponse('Session restored successfully', {
        user: result.user,
        tokens: result.tokens,
    }).send(res);
}

/**
 * Link Google account to current user
 * POST /auth/link/google
 */
export async function linkGoogle(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const { idToken } = req.body as { idToken: string };

    await AuthService.linkGoogleAccount(req.user.id, idToken);

    new SuccessResponse('Google account linked successfully', null).send(res);
}

/**
 * Get linked providers for current user
 * GET /auth/providers
 */
export async function getProviders(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const result = await AuthService.getLinkedProviders(req.user.id);

    new SuccessResponse('Providers retrieved', result).send(res);
}
