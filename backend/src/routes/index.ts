import { Router, RequestHandler } from 'express';
import healthRoutes from './health/index';
import { apiKeyMiddleware } from '../middlewares/api-key.middleware';
import permission from '../middlewares/permission.middleware';
import { authRoutes as authModuleRoutes } from '../modules/auth';
import { adminAuthRoutes } from '../modules/admin-panel/auth';
import { contentManagementRoutes } from '../modules/admin-panel/contentManagement';
import { dashboardRoutes } from '../modules/admin-panel/dashboard';
import { chatRoutes } from '../modules/chat';
import { voiceRoutes } from '../modules/voice';
import { paymentRoutes } from '../modules/payments/routes/payment.routes';
import { settingsRoutes } from '../modules/settings';
import { Permission } from '@prisma/client';

const router = Router();

router.get('/', (_req, res) => {
    res.json({ message: 'Souli API is running', success: true });
});

router.use('/health', healthRoutes);

router.use(apiKeyMiddleware);

router.use(permission(Permission.GENERAL) as RequestHandler);

// modular auth routes
router.use('/auth', authModuleRoutes);

// separate admin auth routes (intentionally excluded from Swagger registration)
router.use('/admin/auth', adminAuthRoutes);

router.use('/admin/content-management', contentManagementRoutes);

router.use('/admin/dashboard', dashboardRoutes);

router.use('/chat', chatRoutes);

router.use('/voice', voiceRoutes);

router.use('/payments', paymentRoutes);

router.use('/settings', settingsRoutes);

export default router;
