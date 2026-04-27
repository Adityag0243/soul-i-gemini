import { Router, RequestHandler } from 'express';
import healthRoutes from './health/index';
import { apiKeyMiddleware } from '../middlewares/api-key.middleware';
import permission from '../middlewares/permission.middleware';
import { authRoutes as authModuleRoutes } from '../modules/auth';
import { chatRoutes } from '../modules/chat';
import { notificationsRoutes } from '../modules/notifications';
import { usersRoutes } from '../modules/users';
import { voiceRoutes } from '../modules/voice';
import { paymentRoutes, couponRoutes } from '../modules/payments/routes/payment.routes';
import { checkinRoutes } from '../modules/checkins';
import { energyNodeRoutes, practiceRoutes, assignmentRoutes } from '../modules/practices';
import { referralRoutes } from '../modules/referrals';
import { aiEventRoutes } from '../modules/ai-events';
import { Permission } from '@prisma/client';

const router = Router();

router.get('/', (_req, res) => {
    res.json({ message: 'Souli API is running', success: true });
});

router.use('/health', healthRoutes);

router.use('/internal/ai-events', aiEventRoutes);

router.use(apiKeyMiddleware);

router.use(permission(Permission.GENERAL) as RequestHandler);

// modular auth routes
router.use('/auth', authModuleRoutes);

router.use('/users', usersRoutes);

router.use('/notifications', notificationsRoutes);

router.use('/chat', chatRoutes);

router.use('/voice', voiceRoutes);

router.use('/payments', paymentRoutes);

router.use('/checkins', checkinRoutes);

router.use('/coupons', couponRoutes);

router.use('/energy-nodes', energyNodeRoutes);

router.use('/practices', practiceRoutes);

router.use('/practice-assignments', assignmentRoutes);

router.use('/referrals', referralRoutes);

export default router;
