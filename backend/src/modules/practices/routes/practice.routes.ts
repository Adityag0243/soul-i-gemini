import { Router } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import { validator } from '../../../middlewares/validator.middleware';
import { ValidationSource } from '../../../helpers/validator';
import authMiddleware from '../../../middlewares/auth.middleware';
import { registry } from '../../../swagger-docs/swagger';
import { listPracticesSchema, practiceFeedbackSchema } from '../schemas/practice.schema';
import * as PracticeController from '../controllers/practice.controller';

const router = Router();

// ============ List Practices ============

registry.registerPath({
    method: 'get',
    path: '/practices',
    summary: 'List Practices',
    description: 'Retrieve practices with optional filtering by energy node and type.',
    tags: ['Practices'],
    security: [{ bearerAuth: [] }],
    parameters: [
        {
            name: 'energyNodeId',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by energy node UUID',
        },
        {
            name: 'type',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by practice type (e.g. breathwork, journaling, somatic, cognitive, grounding)',
        },
        {
            name: 'page',
            in: 'query',
            schema: { type: 'number', default: 1 },
            description: 'Page number',
        },
        {
            name: 'limit',
            in: 'query',
            schema: { type: 'number', default: 20 },
            description: 'Items per page (max 100)',
        },
    ],
    responses: {
        200: { description: 'Practices retrieved' },
        401: { description: 'Unauthorized' },
    },
});

router.get(
    '/',
    authMiddleware,
    validator(listPracticesSchema, ValidationSource.QUERY),
    asyncHandler(PracticeController.listPractices),
);

// ============ Recommended Practices ============

registry.registerPath({
    method: 'get',
    path: '/practices/recommended',
    summary: 'Get Recommended Practices',
    description:
        "Returns practices ranked by aggregate feedback score, scoped to the user's most recent energy node.",
    tags: ['Practices'],
    security: [{ bearerAuth: [] }],
    parameters: [
        {
            name: 'limit',
            in: 'query',
            schema: { type: 'number', default: 10 },
            description: 'Max practices to return',
        },
    ],
    responses: {
        200: { description: 'Recommended practices retrieved' },
        401: { description: 'Unauthorized' },
    },
});

router.get(
    '/recommended',
    authMiddleware,
    asyncHandler(PracticeController.getRecommended),
);

// ============ Get Practice by ID ============

registry.registerPath({
    method: 'get',
    path: '/practices/{id}',
    summary: 'Get Practice by ID',
    description: 'Retrieve full practice content including text script, audio, and video URLs.',
    tags: ['Practices'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: { description: 'Practice retrieved' },
        401: { description: 'Unauthorized' },
        404: { description: 'Practice not found' },
    },
});

router.get(
    '/:id',
    authMiddleware,
    asyncHandler(PracticeController.getPracticeById),
);

// ============ Practice Feedback ============

registry.registerPath({
    method: 'post',
    path: '/practices/{id}/feedback',
    summary: 'Submit Practice Feedback',
    description: 'Record whether a practice made you feel BETTER, SAME, or WORSE.',
    tags: ['Practices - Feedback'],
    security: [{ bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: practiceFeedbackSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Feedback submitted' },
        401: { description: 'Unauthorized' },
        404: { description: 'Practice not found' },
    },
});

router.post(
    '/:id/feedback',
    authMiddleware,
    validator(practiceFeedbackSchema, ValidationSource.BODY),
    asyncHandler(PracticeController.submitFeedback),
);

registry.registerPath({
    method: 'get',
    path: '/practices/{id}/feedback/mine',
    summary: 'Get My Feedback for a Practice',
    description: "Retrieve the current user's feedback entries for a specific practice.",
    tags: ['Practices - Feedback'],
    security: [{ bearerAuth: [] }],
    responses: {
        200: { description: 'Feedback retrieved' },
        401: { description: 'Unauthorized' },
    },
});

router.get(
    '/:id/feedback/mine',
    authMiddleware,
    asyncHandler(PracticeController.getMyFeedback),
);

export default router;
