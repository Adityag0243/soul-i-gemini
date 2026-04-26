import { Router, RequestHandler } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import { validator } from '../../../middlewares/validator.middleware';
import { ValidationSource } from '../../../helpers/validator';
import authMiddleware from '../../../middlewares/auth.middleware';
import { registry } from '../../../swagger-docs/swagger';
import * as UsersController from '../controllers/users.controller';
import { setCallNameSchema, updateMeSchema } from '../schemas/users.schema';

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

registry.registerPath({
    method: 'patch',
    path: '/users/me',
    summary: 'Update Current User',
    description:
        'Partial update of the authenticated user. Only the listed fields are accepted; email/password/avatar have separate endpoints.',
    tags: ['Users'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: updateMeSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'User updated' },
        400: { description: 'Validation error or USER_UNDER_AGE' },
        401: { description: 'Authentication required' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/users/me/call-name',
    summary: 'Set Call Name (Onboarding)',
    description:
        'Onboarding-only setter for callName. Also flips onboardingCompleted=true so the client can transition out of onboarding atomically.',
    tags: ['Users'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: setCallNameSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Call name set' },
        400: { description: 'Validation error' },
        401: { description: 'Authentication required' },
    },
});

router.get('/me', asyncHandler(UsersController.getMe));

router.patch(
    '/me',
    validator(updateMeSchema, ValidationSource.BODY),
    asyncHandler(UsersController.updateMe),
);

router.post(
    '/me/call-name',
    validator(setCallNameSchema, ValidationSource.BODY),
    asyncHandler(UsersController.setCallName),
);

export default router;
