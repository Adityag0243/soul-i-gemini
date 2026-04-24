import { Router, RequestHandler } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import { validator } from '../../../middlewares/validator.middleware';
import { ValidationSource } from '../../../helpers/validator';
import authMiddleware from '../../../middlewares/auth.middleware';
import { registry } from '../../../swagger-docs/swagger';
import { notificationToggleSchema } from '../schemas/settings.schema';
import * as SettingsController from '../controllers/settings.controller';

const router = Router();

router.use(authMiddleware as unknown as RequestHandler);

registry.registerPath({
    method: 'get',
    path: '/settings/notifications',
    summary: 'Get Notification Settings',
    description:
        'Retrieve current notification preferences for daily check-ins and reminders.',
    tags: ['Settings'],
    security: [{ apiKey: [], bearerAuth: [] }],
    responses: {
        200: { description: 'Notification preferences retrieved' },
        401: { description: 'Authentication required' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'patch',
    path: '/settings/notifications/daily-check-in',
    summary: 'Toggle Daily Check-in Notifications',
    description:
        'Enable or disable daily check-in notifications sent as app push notifications.',
    tags: ['Settings'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: notificationToggleSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Daily check-in preference updated' },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'patch',
    path: '/settings/notifications/reminders',
    summary: 'Toggle Reminder Notifications',
    description:
        'Enable or disable reminder notifications (activities, subscription reminders, and other due reminders).',
    tags: ['Settings'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: notificationToggleSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Reminders preference updated' },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
        403: { description: 'Missing or invalid API key' },
    },
});

router.get(
    '/notifications',
    asyncHandler(SettingsController.getNotificationPreferences),
);

router.patch(
    '/notifications/daily-check-in',
    validator(notificationToggleSchema, ValidationSource.BODY),
    asyncHandler(SettingsController.updateDailyCheckInPreference),
);

router.patch(
    '/notifications/reminders',
    validator(notificationToggleSchema, ValidationSource.BODY),
    asyncHandler(SettingsController.updateRemindersPreference),
);

export default router;
