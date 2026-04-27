import { Router } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import { validator } from '../../../middlewares/validator.middleware';
import { ValidationSource } from '../../../helpers/validator';
import authMiddleware from '../../../middlewares/auth.middleware';
import { registry } from '../../../swagger-docs/swagger';
import { createCheckinSchema, listCheckinsSchema, updateCheckinSchema } from '../schemas/checkin.schema';
import * as CheckinController from '../controllers/checkin.controller';

const router = Router();

// ============ Create / Update Check-in ============

registry.registerPath({
    method: 'post',
    path: '/checkins',
    summary: 'Create or Update Daily Check-in',
    description:
        'Upsert a daily check-in by date. If a check-in already exists for the given date, it is updated.',
    tags: ['Check-ins'],
    security: [{ bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: createCheckinSchema,
                },
            },
        },
    },
    responses: {
        201: { description: 'Check-in saved' },
        400: { description: 'Validation error' },
        401: { description: 'Unauthorized' },
    },
});

router.post(
    '/',
    authMiddleware,
    validator(createCheckinSchema, ValidationSource.BODY),
    asyncHandler(CheckinController.createCheckin),
);

// ============ List Check-ins ============

registry.registerPath({
    method: 'get',
    path: '/checkins',
    summary: 'List Check-ins',
    description:
        'Retrieve check-ins within a date range with pagination. Default range is 30 days.',
    tags: ['Check-ins'],
    security: [{ bearerAuth: [] }],
    parameters: [
        {
            name: 'range',
            in: 'query',
            schema: { type: 'string', default: '30d' },
            description: 'Lookback period (e.g. 7d, 30d, 90d)',
        },
        {
            name: 'page',
            in: 'query',
            schema: { type: 'number', default: 1 },
            description: 'Page number',
        },
        {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'number', default: 20 },
            description: 'Items per page (max 100)',
        },
    ],
    responses: {
        200: { description: 'Check-ins retrieved' },
        401: { description: 'Unauthorized' },
    },
});

router.get(
    '/',
    authMiddleware,
    validator(listCheckinsSchema, ValidationSource.QUERY),
    asyncHandler(CheckinController.listCheckins),
);

// ============ Today's Check-in ============

registry.registerPath({
    method: 'get',
    path: '/checkins/today',
    summary: 'Get Today\'s Check-in',
    description:
        'Retrieve the current user\'s check-in for today. Returns null if none exists.',
    tags: ['Check-ins'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: { description: 'Today check-in retrieved (null if none)' },
        401: { description: 'Unauthorized' },
    },
});

router.get(
    '/today',
    authMiddleware,
    asyncHandler(CheckinController.getTodayCheckin),
);

// ============ Streak ============

registry.registerPath({
    method: 'get',
    path: '/checkins/streak',
    summary: 'Get Check-in Streak',
    description:
        'Returns the current consecutive-day streak and the longest streak for the user.',
    tags: ['Check-ins'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: { description: 'Streak retrieved' },
        401: { description: 'Unauthorized' },
    },
});

router.get(
    '/streak',
    authMiddleware,
    asyncHandler(CheckinController.getStreak),
);

// ============ Single Check-in CRUD ============

registry.registerPath({
    method: 'get',
    path: '/checkins/{id}',
    summary: 'Get Check-in by ID',
    description: 'Retrieve a single check-in by its UUID.',
    tags: ['Check-ins'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: { description: 'Check-in retrieved' },
        401: { description: 'Unauthorized' },
        404: { description: 'Check-in not found' },
    },
});

router.get(
    '/:id',
    authMiddleware,
    asyncHandler(CheckinController.getCheckinById),
);

registry.registerPath({
    method: 'patch',
    path: '/checkins/{id}',
    summary: 'Update Check-in',
    description: 'Partially update an existing check-in.',
    tags: ['Check-ins'],
    security: [{ bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: updateCheckinSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Check-in updated' },
        400: { description: 'Validation error' },
        401: { description: 'Unauthorized' },
        404: { description: 'Check-in not found' },
    },
});

router.patch(
    '/:id',
    authMiddleware,
    validator(updateCheckinSchema, ValidationSource.BODY),
    asyncHandler(CheckinController.updateCheckin),
);

registry.registerPath({
    method: 'delete',
    path: '/checkins/{id}',
    summary: 'Delete Check-in',
    description: 'Permanently delete a check-in.',
    tags: ['Check-ins'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: { description: 'Check-in deleted' },
        401: { description: 'Unauthorized' },
        404: { description: 'Check-in not found' },
    },
});

router.delete(
    '/:id',
    authMiddleware,
    asyncHandler(CheckinController.deleteCheckin),
);

export default router;
