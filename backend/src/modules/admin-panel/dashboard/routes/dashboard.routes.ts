import { Router, RequestHandler } from 'express';
import authMiddleware from '../../../../middlewares/auth.middleware';
import { asyncHandler } from '../../../../core/async-handler';
import { registry } from '../../../../swagger-docs/swagger';
import DashboardController from '../controllers/dashboard.controller';

const router = Router();

router.use(authMiddleware as unknown as RequestHandler);

registry.registerPath({
    method: 'get',
    path: '/admin/dashboard/overview',
    summary: 'Get Admin Dashboard Overview',
    description:
        'Retrieve aggregated analytics for the admin dashboard including summary stats, chart data, chatbot performance, funnel, and recent activity.',
    tags: ['Admin Dashboard'],
    security: [{ apiKey: [], bearerAuth: [] }],
    responses: {
        200: { description: 'Dashboard overview retrieved' },
        401: { description: 'Authentication required' },
        403: { description: 'Missing API key or non-admin access' },
    },
});

router.get('/overview', asyncHandler(DashboardController.getOverview));

export default router;
