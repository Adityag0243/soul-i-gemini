import { Router, RequestHandler } from 'express';

import healthRoutes from './health/index.js';
import { apiKeyMiddleware } from './auth/api-key.js';
import permission from '../middlewares/permission.middleware.js';
import authRoutes from './auth';
import { Permission } from '@prisma/client';

const router = Router();

router.use('/health', healthRoutes);

router.use(apiKeyMiddleware);

router.use(permission(Permission.GENERAL) as RequestHandler);

router.use('/auth', authRoutes);

export default router;
