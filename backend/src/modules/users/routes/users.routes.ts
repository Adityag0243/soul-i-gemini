import { Router, RequestHandler } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import { validator } from '../../../middlewares/validator.middleware';
import { ValidationSource } from '../../../helpers/validator';
import authMiddleware from '../../../middlewares/auth.middleware';
import { avatarUpload } from '../../../middlewares/upload.middleware';
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

registry.registerPath({
    method: 'post',
    path: '/users/me/avatar',
    summary: 'Upload Avatar',
    description:
        'Multipart upload of a single image file in field "file". Max 5 MB; image/jpeg|png|webp. Backend resizes to 256×256 + 64×64 (WebP) and uploads both to S3.',
    tags: ['Users'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'multipart/form-data': {
                    schema: {
                        type: 'object',
                        properties: {
                            file: { type: 'string', format: 'binary' },
                        },
                        required: ['file'],
                    },
                },
            },
        },
    },
    responses: {
        200: { description: 'Avatar updated' },
        400: { description: 'Missing file, oversize, or unsupported MIME' },
        401: { description: 'Authentication required' },
    },
});

router.post(
    '/me/avatar',
    avatarUpload,
    asyncHandler(UsersController.uploadAvatar),
);

registry.registerPath({
    method: 'delete',
    path: '/users/me/avatar',
    summary: 'Remove Avatar',
    description:
        'Clear the user\'s avatar pointer. Underlying S3 objects are retained for audit; a lifecycle rule sweeps them after 30 days.',
    tags: ['Users'],
    security: [{ apiKey: [], bearerAuth: [] }],
    responses: {
        200: { description: 'Avatar removed' },
        401: { description: 'Authentication required' },
    },
});

router.delete('/me/avatar', asyncHandler(UsersController.deleteAvatar));

export default router;
