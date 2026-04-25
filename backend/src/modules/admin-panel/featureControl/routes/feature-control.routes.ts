import { Router, RequestHandler } from 'express';
import authMiddleware from '../../../../middlewares/auth.middleware';
import { asyncHandler } from '../../../../core/async-handler';
import { validator } from '../../../../middlewares/validator.middleware';
import { ValidationSource } from '../../../../helpers/validator';
import { registry } from '../../../../swagger-docs/swagger';
import * as FeatureControlController from '../controllers/feature-control.controller';
import {
    featureKeyParamSchema,
    featureToggleSchema,
} from '../schemas/feature-control.schema';

const router = Router();

router.use(authMiddleware as unknown as RequestHandler);

registry.registerPath({
    method: 'get',
    path: '/admin/feature-control',
    summary: 'Get Feature Control Settings',
    description:
        'Get all feature toggles with total, active, and disabled summary counts for the admin Feature Control page.',
    tags: ['Admin Feature Control'],
    security: [{ apiKey: [], bearerAuth: [] }],
    responses: {
        200: { description: 'Feature controls retrieved' },
        401: { description: 'Authentication required' },
        403: { description: 'Missing API key or non-admin access' },
    },
});

registry.registerPath({
    method: 'patch',
    path: '/admin/feature-control/{featureKey}',
    summary: 'Toggle Feature Control',
    description:
        'Enable or disable one feature toggle in admin Feature Control settings.',
    tags: ['Admin Feature Control'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        params: featureKeyParamSchema,
        body: {
            content: {
                'application/json': {
                    schema: featureToggleSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Feature control updated' },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
        403: { description: 'Missing API key or non-admin access' },
    },
});

router.get('/', asyncHandler(FeatureControlController.getFeatureControls));

router.patch(
    '/:featureKey',
    validator(featureKeyParamSchema, ValidationSource.PARAM),
    validator(featureToggleSchema, ValidationSource.BODY),
    asyncHandler(FeatureControlController.updateFeatureControl),
);

export default router;
