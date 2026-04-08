import { Router, RequestHandler } from 'express';
import healthRoutes from './health/index';
import { apiKeyMiddleware } from './auth/api-key';
import permission from '../middlewares/permission.middleware';
// import authRoutes from './auth';
import { authRoutes as authModuleRoutes } from '../modules/auth';
import { chatRoutes } from '../modules/chat';
import { voiceRoutes } from '../modules/voice';
import { paymentRoutes } from '../modules/payments/routes/payment.routes';
import { Permission } from '@prisma/client';

const router = Router();

router.get('/', (_req, res) => {
    res.json({ message: 'Souli API is running', success: true });
});

router.use('/health', healthRoutes);

router.use(apiKeyMiddleware);

router.use(permission(Permission.GENERAL) as RequestHandler);

// legacy auth routes  --> i am not using the template legacy auth
// router.use('/auth', authRoutes);

// modular auth routes
router.use('/auth', authModuleRoutes);

router.use('/chat', chatRoutes);

router.use('/voice', voiceRoutes);

router.use('/payments', paymentRoutes);

export default router;
