import { Request, Response } from 'express';
import {
    SuccessResponse,
    TokenRefreshResponse,
} from '../../../../core/api-response';
import { cookieOptions } from '../../../../config';
import { getAccessToken, getRefreshToken } from '../../../../core/auth-utils';
import { CookieKeys } from '../../../../helpers/validator';
import { ProtectedRequest } from '../../../../types/app-requests';
import AdminAuthService from '../services/admin-auth.service';
import { AdminEmailLoginInput } from '../schemas/admin-auth.schema';

function setAdminCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
): void {
    const adminCookieOptions = {
        ...cookieOptions,
        path: '/admin',
    };

    res.cookie(
        CookieKeys.REFRESH_TOKEN,
        tokens.refreshToken,
        adminCookieOptions,
    );
    res.cookie(CookieKeys.ACCESS_TOKEN, tokens.accessToken, adminCookieOptions);
}

export async function emailLogin(
    req: Request<object, object, AdminEmailLoginInput>,
    res: Response,
): Promise<void> {
    const result = await AdminAuthService.loginWithEmail(req.body);

    setAdminCookies(res, result.tokens);

    new SuccessResponse('Admin login successful', {
        user: result.user,
        tokens: result.tokens,
    }).send(res);
}

export async function refreshTokens(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const refreshToken = getRefreshToken(req);

    const tokens = await AdminAuthService.refreshTokenPair(refreshToken);

    setAdminCookies(res, tokens);

    new TokenRefreshResponse(
        'Token Issued',
        tokens.accessToken,
        tokens.refreshToken,
    ).send(res);
}

function clearAdminCookies(res: Response): void {
    const adminCookieOptions = {
        ...cookieOptions,
        path: '/admin',
    };

    res.clearCookie(CookieKeys.REFRESH_TOKEN, adminCookieOptions);
    res.clearCookie(CookieKeys.ACCESS_TOKEN, adminCookieOptions);
}

export async function logout(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    await AdminAuthService.logoutCurrentSession(req.user.id, req.keystore.id);

    clearAdminCookies(res);

    new SuccessResponse('Admin logout successful', null).send(res);
}

export default {
    emailLogin,
    refreshTokens,
    logout,
};
