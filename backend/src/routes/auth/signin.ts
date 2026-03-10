import { asyncHandler } from '../../core/async-handler';
import { Router } from 'express';
import { validator } from '../../middlewares/validator.middleware';
import schema from './schema';
import { PublicRequest } from '../../types/app-requests';
import UserRepo from '../../database/repositories/user.repo';
import { AuthFailureError, BadRequestError } from '../../core/api-error';
import crypto from 'crypto';
import KeystoreRepo from '../../database/repositories/keystore.repo';
import { createTokens, isPasswordCorrect } from '../../core/auth-utils';
import { getUserData } from '../../core/utils';
import { SuccessResponse } from '../../core/api-response';
import { ValidationSource } from '../../helpers/validator';
import { setCookies } from '../../core/cookie-utils';
import { registry } from '../../docs/swagger';

registry.registerPath({
  method: 'post',
  path: '/auth/signin',
  summary: 'User Signin',
  description: 'Login with email and password. Returns user data and tokens. Requires API key.',
  tags: ['Auth'],
  security: [{ apiKey: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: schema.signin,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Login success',
    },
    400: {
      description: 'Validation error or user not registered',
    },
    401: {
      description: 'Authentication failure (invalid password)',
    },
    403: {
      description: 'Missing or invalid API key',
    },
  },
});

const router = Router();

router.post(
    '/',
    validator(schema.signin, ValidationSource.BODY),
    asyncHandler(async (req: PublicRequest, res) => {
        const user = await UserRepo.findByEmail(req.body.email);

        if (!user) throw new BadRequestError('User not registered.');

        const isValid = await isPasswordCorrect(
            req.body.password,
            user.password,
        );

        if (!isValid) throw new AuthFailureError('Authentication failure.');

        const accessTokenKey = crypto.randomBytes(64).toString('hex');
        const refreshTokenKey = crypto.randomBytes(64).toString('hex');

        await KeystoreRepo.create(user.id, accessTokenKey, refreshTokenKey);
        const tokens = await createTokens(
            user,
            accessTokenKey,
            refreshTokenKey,
        );
        const userData = getUserData(user);

        // Set cookie for browser
        setCookies(res, tokens);

        new SuccessResponse('Login success.', {
            user: userData,
            tokens: tokens,
        }).send(res);
    }),
);

export default router;
