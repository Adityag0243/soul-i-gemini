import { Router } from 'express';
import { ValidationSource } from '../../../../helpers/validator';
import { validator } from '../../../../middlewares/validator.middleware';
import { asyncHandler } from '../../../../core/async-handler';
import authMiddleware from '../../../../middlewares/auth.middleware';
import { authorize } from '../../../../middlewares/authorize.middleware';
import AdminAuthController from '../controllers/admin-auth.controller';
import { RoleCode } from '@prisma/client';
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

router.post(
    '/logout',
    authMiddleware as unknown as import('express').RequestHandler,
    authorize(RoleCode.ADMIN),
    asyncHandler(AdminAuthController.logout),
);

export default router;
