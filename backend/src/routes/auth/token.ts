import { Router } from 'express';
import { validator } from '../../middlewares/validator.middleware';
import schema from './schema';
import { ValidationSource } from '../../helpers/validator';
import { asyncHandler } from '../../core/async-handler';
import { ProtectedRequest } from '../../types/app-requests';
import { getAccessToken, getRefreshToken } from '../../core/auth-utils';
import JWT from '../../core/jwt-utils';
import { validateTokenData, createTokens } from '../../core/auth-utils';
import UserRepo from '../../database/repositories/user.repo';
import KeystoreRepo from '../../database/repositories/keystore.repo';
import { AuthFailureError } from '../../core/api-error';
import crypto from 'crypto';
import { TokenRefreshResponse } from '../../core/api-response';
import { registry } from '../../docs/swagger';

registry.registerPath({
  method: 'post',
  path: '/auth/token/refresh',
  summary: 'Refresh tokens',
  description:
    'Issue new access and refresh tokens. Send refresh token in body (JSON) or in cookies. Requires API key and Bearer JWT (current access token).',
  tags: ['Auth'],
  security: [{ apiKey: [], bearerAuth: [] }],
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

const router = Router();

router.post(
    '/refresh',
    validator(schema.auth, ValidationSource.REQUEST),
    validator(schema.refreshToken, ValidationSource.REQUEST),
    asyncHandler(async (req: ProtectedRequest, res) => {
        req.accessToken = getAccessToken(req);

        const accessTokenPayload = await JWT.decode(req.accessToken);
        validateTokenData(accessTokenPayload);

        const userId = parseInt(accessTokenPayload.sub, 10);
        if (isNaN(userId))
            throw new AuthFailureError('Invalid user ID in token');

        const user = await UserRepo.findById(userId);

        if (!user) throw new AuthFailureError('User not registered');
        req.user = user;

        // get refresh token either from body for mobile or from cookies for web
        const refreshToken = getRefreshToken(req);

        const refreshTokenPayload = await JWT.validate(refreshToken);
        validateTokenData(refreshTokenPayload);

        if (accessTokenPayload.sub !== refreshTokenPayload.sub)
            throw new AuthFailureError('Invalid access token');

        const keystore = await KeystoreRepo.find(
            req.user.id,
            accessTokenPayload.prm,
            refreshTokenPayload.prm,
        );

        if (!keystore) throw new AuthFailureError('Invalid access token');
        await KeystoreRepo.remove(keystore.id);

        const accessTokenKey = crypto.randomBytes(64).toString('hex');
        const refreshTokenKey = crypto.randomBytes(64).toString('hex');

        await KeystoreRepo.create(req.user.id, accessTokenKey, refreshTokenKey);
        const tokens = await createTokens(
            req.user,
            accessTokenKey,
            refreshTokenKey,
        );

        new TokenRefreshResponse(
            'Token Issued',
            tokens.accessToken,
            tokens.refreshToken,
        ).send(res);
    }),
);

export default router;
