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
    const accessToken = getAccessToken(req);
    const refreshToken = getRefreshToken(req);

    const tokens = await AdminAuthService.refreshTokenPair(
        accessToken,
        refreshToken,
    );

    setAdminCookies(res, tokens);

    new TokenRefreshResponse(
        'Token Issued',
        tokens.accessToken,
        tokens.refreshToken,
    ).send(res);
}

export default {
    emailLogin,
    refreshTokens,
};
