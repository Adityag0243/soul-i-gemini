import { Router } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import authMiddleware from '../../../middlewares/auth.middleware';
import { registry } from '../../../swagger-docs/swagger';
import * as AssignmentController from '../controllers/assignment.controller';

const router = Router();

// ============ Active Assignments ============

registry.registerPath({
    method: 'get',
    path: '/practice-assignments/active',
    summary: 'Get Active Assignments',
    description: 'List all incomplete practice assignments for the current user.',
    tags: ['Practice Assignments'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: { description: 'Active assignments retrieved' },
        401: { description: 'Unauthorized' },
    },
});

router.get(
    '/active',
    authMiddleware,
    asyncHandler(AssignmentController.getActive),
);

// ============ List Assignments ============

registry.registerPath({
    method: 'get',
    path: '/practice-assignments',
    summary: 'List Assignments',
    description: 'List practice assignments within a date range.',
    tags: ['Practice Assignments'],
    security: [{ bearerAuth: [] }],
    parameters: [
        {
            name: 'range',
            in: 'query',
            schema: { type: 'string', default: '30d' },
            description: 'Lookback period (e.g. 7d, 30d)',
        },
        {
            name: 'page',
            in: 'query',
            schema: { type: 'number', default: 1 },
        },
        {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'number', default: 20 },
        },
    ],
    responses: {
        200: { description: 'Assignments retrieved' },
        401: { description: 'Unauthorized' },
    },
});

router.get(
    '/',
    authMiddleware,
    asyncHandler(AssignmentController.listAssignments),
);

// ============ Single Assignment ============

registry.registerPath({
    method: 'get',
    path: '/practice-assignments/{id}',
    summary: 'Get Assignment by ID',
    description: 'Retrieve a single practice assignment.',
    tags: ['Practice Assignments'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: { description: 'Assignment retrieved' },
        401: { description: 'Unauthorized' },
        404: { description: 'Assignment not found' },
    },
});

router.get(
    '/:id',
    authMiddleware,
    asyncHandler(AssignmentController.getById),
);

// ============ Complete / Delete ============

registry.registerPath({
    method: 'post',
    path: '/practice-assignments/{id}/complete',
    summary: 'Complete Assignment',
    description: 'Mark a practice assignment as completed.',
    tags: ['Practice Assignments'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: { description: 'Assignment completed' },
        401: { description: 'Unauthorized' },
        404: { description: 'Assignment not found' },
    },
});

router.post(
    '/:id/complete',
    authMiddleware,
    asyncHandler(AssignmentController.complete),
);

registry.registerPath({
    method: 'delete',
    path: '/practice-assignments/{id}',
    summary: 'Delete Assignment',
    description: 'Remove a practice assignment.',
    tags: ['Practice Assignments'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: { description: 'Assignment deleted' },
        401: { description: 'Unauthorized' },
        404: { description: 'Assignment not found' },
    },
});

router.delete(
    '/:id',
    authMiddleware,
    asyncHandler(AssignmentController.remove),
);

export default router;
