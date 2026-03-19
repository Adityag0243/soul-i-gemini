import { Router, RequestHandler } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import { validator } from '../../../middlewares/validator.middleware';
import { ValidationSource } from '../../../helpers/validator';
import authMiddleware from '../../../middlewares/auth.middleware';
import { registry } from '../../../docs/swagger';
import {
    createVoiceTokenSchema,
    createVoiceBootstrapSchema,
} from '../schemas/voice.schema';
import * as VoiceController from '../controllers/voice.controller';

const router = Router();

// voice endpoints require user authentication
router.use(authMiddleware as unknown as RequestHandler);

registry.registerPath({
    method: 'post',
    path: '/voice/token',
    summary: 'Create LiveKit Voice Token',
    description:
        'Create a short-lived LiveKit access token for realtime voice conversation. Mobile client should call this when voice button is tapped.',
    tags: ['Voice'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: createVoiceTokenSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Voice token created' },
        401: { description: 'Authentication required' },
        403: { description: 'Missing or invalid API key' },
        500: { description: 'LiveKit configuration missing or invalid' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/voice/bootstrap',
    summary: 'Bootstrap Realtime Voice Session',
    description:
        'Creates or validates a chat session and returns LiveKit voice token + room metadata for low-latency WebRTC voice conversation.',
    tags: ['Voice'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: createVoiceBootstrapSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Voice bootstrap payload created' },
        401: { description: 'Authentication required' },
        403: { description: 'Missing or invalid API key' },
        404: { description: 'Provided chat session not found for user' },
        500: { description: 'LiveKit configuration missing or invalid' },
    },
});

router.post(
    '/token',
    validator(createVoiceTokenSchema, ValidationSource.BODY),
    asyncHandler(VoiceController.createVoiceToken),
);

router.post(
    '/bootstrap',
    validator(createVoiceBootstrapSchema, ValidationSource.BODY),
    asyncHandler(VoiceController.createVoiceBootstrap),
);

export default router;
