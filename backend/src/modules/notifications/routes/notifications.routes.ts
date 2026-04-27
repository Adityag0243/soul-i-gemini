import { Router, RequestHandler } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import { validator } from '../../../middlewares/validator.middleware';
import { ValidationSource } from '../../../helpers/validator';
import authMiddleware from '../../../middlewares/auth.middleware';
import { registry } from '../../../swagger-docs/swagger';
import * as NotificationsController from '../controllers/notifications.controller';
import {
    registerDeviceTokenSchema,
    unregisterDeviceTokenSchema,
} from '../schemas/notifications.schema';

const router = Router();

router.use(authMiddleware as unknown as RequestHandler);

registry.registerPath({
    method: 'post',
    path: '/notifications/token',
    summary: 'Register Device Push Token',
    description:
        'Register or refresh a device push token. Upserts on token uniqueness — if a device changed hands the existing row re-points at the current user.',
    tags: ['Notifications'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: registerDeviceTokenSchema,
                },
            },
        },
    },
    responses: {
        201: { description: 'Device token registered' },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
    },
});

registry.registerPath({
    method: 'delete',
    path: '/notifications/token',
    summary: 'Unregister Device Push Token',
    description:
        'Soft-deactivate a device push token (called on logout). Idempotent — unknown / foreign tokens succeed silently.',
    tags: ['Notifications'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: unregisterDeviceTokenSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Device token removed' },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
    },
});

router.post(
    '/token',
    validator(registerDeviceTokenSchema, ValidationSource.BODY),
    asyncHandler(NotificationsController.registerToken),
);

router.delete(
    '/token',
    validator(unregisterDeviceTokenSchema, ValidationSource.BODY),
    asyncHandler(NotificationsController.unregisterToken),
);

export default router;
