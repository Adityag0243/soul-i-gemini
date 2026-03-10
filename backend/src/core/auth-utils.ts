import { AuthFailureError, InternalError } from './api-error';
import { ProtectedRequest, Tokens } from '../types/app-requests';
import JWT, { JwtPayload } from './jwt-utils';
import { tokenInfo } from '../config';
import bcryptjs from 'bcryptjs';
import { User } from '@prisma/client';

export const getAccessToken = (req: ProtectedRequest) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }

    const cookieToken: string | undefined = req.cookies?.accessToken;
    if (cookieToken && cookieToken.trim().length > 0) {
        return cookieToken;
    }

    throw new AuthFailureError('Access token missing');
};

export const getRefreshToken = (req: ProtectedRequest) => {
    if (req.body?.refreshToken) {
        return req.body.refreshToken;
    }

    if (req.cookies?.refreshToken) {
        return req.cookies.refreshToken;
    }
    throw new AuthFailureError('Refresh Token is missing.');
};
export const validateTokenData = (payload: JwtPayload): boolean => {
    if (
        !payload ||
        !payload.iss ||
        !payload.sub ||
        !payload.aud ||
        !payload.prm ||
        payload.iss !== tokenInfo.issuer ||
        payload.aud !== tokenInfo.audience ||
        !/^\d+$/.test(payload.sub) // Validate that sub is a numeric string (user ID)
    )
        throw new AuthFailureError('Invalid Access Token');
    return true;
};

export const createTokens = async (
    user: User,
    accessTokenKey: string,
    refreshTokenKey: string,
): Promise<Tokens> => {
    const accessToken = await JWT.encode(
        new JwtPayload(
            tokenInfo.issuer,
            tokenInfo.audience,
            user.id.toString(),
            accessTokenKey,
            tokenInfo.accessTokenValidity,
        ),
    );

    if (!accessToken) throw new InternalError();

    const refreshToken = await JWT.encode(
        new JwtPayload(
            tokenInfo.issuer,
            tokenInfo.audience,
            user.id.toString(),
            refreshTokenKey,
            tokenInfo.refreshTokenValidity,
        ),
    );

    if (!refreshToken) throw new InternalError();

    return {
        accessToken: accessToken,
        refreshToken: refreshToken,
    } as Tokens;
};

export const isPasswordCorrect = async function (
    userPassword: string,
    hashedPassword: string,
) {
    return await bcryptjs.compare(userPassword, hashedPassword);
};
