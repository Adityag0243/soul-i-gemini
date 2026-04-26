import { Router, RequestHandler } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import authMiddleware from '../../../middlewares/auth.middleware';
import { registry } from '../../../swagger-docs/swagger';
import * as UsersController from '../controllers/users.controller';

const router = Router();

router.use(authMiddleware as unknown as RequestHandler);

registry.registerPath({
    method: 'get',
    path: '/users/me',
    summary: 'Get Current User',
    description:
        'Get the canonical user profile for the authenticated caller. id is stringified; password is never included.',
    tags: ['Users'],
    security: [{ apiKey: [], bearerAuth: [] }],
    responses: {
        200: { description: 'User retrieved' },
        401: { description: 'Authentication required' },
    },
});

router.get('/me', asyncHandler(UsersController.getMe));

export default router;
