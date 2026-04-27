import { Router, Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import { validator } from '../../../middlewares/validator.middleware';
import { ValidationSource } from '../../../helpers/validator';
import { ForbiddenError } from '../../../core/api-error';
import { aiServiceConfig } from '../../../config';
import { registry } from '../../../swagger-docs/swagger';
import * as AiEventController from '../controllers/ai-event.controller';
import { aiEventSchema } from '../schemas/ai-event.schema';

const router = Router();

function internalKeyGuard(req: Request, _res: Response, next: NextFunction) {
    const key = req.headers['x-internal-api-key'];
    if (!key || key !== aiServiceConfig.internalApiKey) {
        throw new ForbiddenError('Invalid internal API key');
    }
    next();
}

registry.registerPath({
    method: 'post',
    path: '/internal/ai-events',
    summary: 'Receive AI Service Event',
    description:
        'Webhook endpoint called by the AI service to notify the backend of session events: phase_change, crisis_detected, solution_complete, three_day_task_assigned, name_extracted. Authenticated via X-Internal-API-Key header.',
    tags: ['Internal - AI Events'],
    security: [{ internalApiKey: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: aiEventSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Event processed' },
        400: { description: 'Validation error' },
        403: { description: 'Invalid internal API key' },
    },
});

router.post(
    '/',
    internalKeyGuard,
    validator(aiEventSchema, ValidationSource.BODY),
    asyncHandler(AiEventController.receiveEvent),
);

export default router;
