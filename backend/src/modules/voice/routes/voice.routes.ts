import { Router, RequestHandler } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import { validator } from '../../../middlewares/validator.middleware';
import { ValidationSource } from '../../../helpers/validator';
import authMiddleware from '../../../middlewares/auth.middleware';
import { registry } from '../../../docs/swagger';
import { createVoiceTokenSchema } from '../schemas/voice.schema';
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

router.post(
    '/token',
    validator(createVoiceTokenSchema, ValidationSource.BODY),
    asyncHandler(VoiceController.createVoiceToken),
);

export default router;
