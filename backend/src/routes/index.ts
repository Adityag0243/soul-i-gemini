import { Router, RequestHandler } from 'express';
import healthRoutes from './health/index.js';
import { apiKeyMiddleware } from './auth/api-key.js';
import permission from '../middlewares/permission.middleware.js';
// import authRoutes from './auth';
import { authRoutes as authModuleRoutes } from '../modules/auth';
import { chatRoutes } from '../modules/chat';
import { voiceRoutes } from '../modules/voice';
import { Permission } from '@prisma/client';

const router = Router();

router.use('/health', healthRoutes);

router.use(apiKeyMiddleware);

router.use(permission(Permission.GENERAL) as RequestHandler);

// Legacy auth routes (kept for backward compatibility)
// router.use('/auth', authRoutes);

// modular auth routes
router.use('/auth', authModuleRoutes);

// Chat routes
router.use('/chat', chatRoutes);

// Voice routes
router.use('/voice', voiceRoutes);

export default router;
