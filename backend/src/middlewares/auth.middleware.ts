import { Router } from 'express';
import { ValidationSource } from '../helpers/validator';
import { validator } from './validator.middleware';
import schema from '../routes/auth/schema';
import { ProtectedRequest } from '../types/app-requests';
import { asyncHandler } from '../core/async-handler';
import { getAccessToken, validateTokenData } from '../core/auth-utils';
import jwtUtils from '../core/jwt-utils';
import {
    AccessTokenError,
    AuthFailureError,
    TokenExpiredError,
} from '../core/api-error';
import userRepo from '../database/repositories/user.repo';
import keystoreRepo from '../database/repositories/keystore.repo';

const router = Router();

export default router.use(
    validator(schema.auth, ValidationSource.REQUEST),
    asyncHandler(async (req: ProtectedRequest, _res, next) => {
        req.accessToken = getAccessToken(req);

        try {
            const payload = await jwtUtils.validate(req.accessToken);
            validateTokenData(payload);

            const userId = parseInt(payload.sub, 10);
            if (isNaN(userId))
                throw new AuthFailureError('Invalid user ID in token');

            const user = await userRepo.findById(userId);
            if (!user) throw new AuthFailureError('User not registered.');
            req.user = user;

            const keystore = await keystoreRepo.findForKey(
                req.user.id,
                payload.prm,
            );
            if (!keystore) throw new AuthFailureError('Invalid access token.');
            req.keystore = keystore;

            return next();
        } catch (e) {
            if (e instanceof TokenExpiredError)
                throw new AccessTokenError(e.message);
            throw e;
        }
    }),
);
