import { Router } from 'express';
import { ValidationSource } from '../../../../helpers/validator';
import { validator } from '../../../../middlewares/validator.middleware';
import { asyncHandler } from '../../../../core/async-handler';
import AdminAuthController from '../controllers/admin-auth.controller';
import {
    adminAuthRequestSchema,
    adminEmailLoginSchema,
    adminRefreshTokenSchema,
} from '../schemas/admin-auth.schema';

const router = Router();

router.post(
    '/login',
    validator(adminEmailLoginSchema, ValidationSource.BODY),
    asyncHandler(AdminAuthController.emailLogin),
);

router.post(
    '/token/refresh',
    validator(adminAuthRequestSchema, ValidationSource.REQUEST),
    validator(adminRefreshTokenSchema, ValidationSource.REQUEST),
    asyncHandler(AdminAuthController.refreshTokens),
);

export default router;
