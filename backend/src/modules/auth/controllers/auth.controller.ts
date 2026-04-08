import { Request, Response } from 'express';
import {
    SuccessResponse,
    SuccessCreatedResponse,
    TokenRefreshResponse,
} from '../../../core/api-response';
import { clearCookies } from '../../../core/cookie-utils';
import { setCookies } from '../../../core/cookie-utils';
import { getAccessToken, getRefreshToken } from '../../../core/auth-utils';
import { ProtectedRequest } from '../../../types/app-requests';
import AuthService from '../services/auth.service';
import {
    EmailRegisterInput,
    EmailLoginInput,
    GoogleLoginInput,
    AnonymousLoginInput,
    SouliKeyRestoreInput,
    ForgotPasswordRequestInput,
    ForgotPasswordVerifyInput,
    ForgotPasswordResetInput,
    ResetJourneyInput,
    EraseAllDataInput,
} from '../schemas/auth.schema';

//register with email and password
// POST /auth/email/register

export async function emailRegister(
    req: Request<object, object, EmailRegisterInput>,
    res: Response,
): Promise<void> {
    const result = await AuthService.registerWithEmail(req.body);
    // set cookies for web clients
    setCookies(res, result.tokens);

    new SuccessCreatedResponse('Registration successful', {
        user: result.user,
        tokens: result.tokens,
    }).send(res);
}

// login with email and password
// POST /auth/email/login

export async function emailLogin(
    req: Request<object, object, EmailLoginInput>,
    res: Response,
): Promise<void> {
    const result = await AuthService.loginWithEmail(req.body);

    // set cookies for web clients
    setCookies(res, result.tokens);

    new SuccessResponse('Login successful', {
        user: result.user,
        tokens: result.tokens,
    }).send(res);
}

// login/register with Google
// POST /auth/google

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

// anonymous login - creates new anonymous user
// POST /auth/anonymous

export async function anonymousLogin(
    req: Request<object, object, AnonymousLoginInput>,
    res: Response,
): Promise<void> {
    const result = await AuthService.loginAnonymous(req.body);

    // set cookies for web clients
    setCookies(res, result.tokens);

    new SuccessCreatedResponse('Anonymous account created', {
        user: result.user,
        tokens: result.tokens,
        souliKey: result.souliKey, // Important: User must save this key!
    }).send(res);
}

// refresh auth tokens
// POST /auth/token/refresh

export async function refreshTokens(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const accessToken = getAccessToken(req);
    const refreshToken = getRefreshToken(req);

    const tokens = await AuthService.refreshTokenPair(
        accessToken,
        refreshToken,
    );

    setCookies(res, tokens);

    new TokenRefreshResponse(
        'Token Issued',
        tokens.accessToken,
        tokens.refreshToken,
    ).send(res);
}

// restore session with Souli Key
// POST /auth/restore

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

// link Google account to current user
// POST /auth/link/google
export async function linkGoogle(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const { idToken } = req.body as { idToken: string };

    await AuthService.linkGoogleAccount(req.user.id, idToken);

    new SuccessResponse('Google account linked successfully', null).send(res);
}

// get linked providers for current user
// GET /auth/providers

export async function getProviders(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const result = await AuthService.getLinkedProviders(req.user.id);

    new SuccessResponse('Providers retrieved', result).send(res);
}

// reset journey for current user
// POST /auth/privacy/reset-journey

export async function resetJourney(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const input = req.body as ResetJourneyInput;
    const result = await AuthService.resetJourney(req.user.id, input);

    new SuccessResponse('Journey reset successfully', result).send(res);
}

// erase all data for current user
// DELETE /auth/privacy/erase-all

export async function eraseAllData(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const input = req.body as EraseAllDataInput;
    const result = await AuthService.eraseAllData(req.user.id, input);

    clearCookies(res);
    new SuccessResponse('Account and data erased successfully', result).send(
        res,
    );
}

// request password reset OTP
// POST /auth/password/forgot

export async function requestForgotPasswordOtp(
    req: Request<object, object, ForgotPasswordRequestInput>,
    res: Response,
): Promise<void> {
    const result = await AuthService.requestPasswordResetOtp(req.body);

    new SuccessResponse(result.message, result).send(res);
}

// verify password reset OTP
// POST /auth/password/forgot/verify

export async function verifyForgotPasswordOtp(
    req: Request<object, object, ForgotPasswordVerifyInput>,
    res: Response,
): Promise<void> {
    const result = await AuthService.verifyPasswordResetOtp(req.body);

    new SuccessResponse('OTP verified successfully', result).send(res);
}

// reset password after OTP verification
// POST /auth/password/forgot/reset

export async function resetForgotPassword(
    req: Request<object, object, ForgotPasswordResetInput>,
    res: Response,
): Promise<void> {
    const result = await AuthService.resetPassword(req.body);

    new SuccessResponse(result.message, null).send(res);
}
