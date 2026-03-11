import { Router, RequestHandler } from 'express';
import { asyncHandler } from '../../../core/async-handler';
import { validator } from '../../../middlewares/validator.middleware';
import { ValidationSource } from '../../../helpers/validator';
import authMiddleware from '../../../middlewares/auth.middleware';
import { registry } from '../../../docs/swagger';
import {
    createSessionSchema,
    updateSessionSchema,
    sendMessageSchema,
    sessionIdParamSchema,
    getSessionsQuerySchema,
    getMessagesQuerySchema,
} from '../schemas/chat.schema';
import * as ChatController from '../controllers/chat.controller';

const router = Router();

// All chat routes require authentication
router.use(authMiddleware as unknown as RequestHandler);

// ============================================================
// SWAGGER DOCUMENTATION
// ============================================================

registry.registerPath({
    method: 'post',
    path: '/chat/sessions',
    summary: 'Create Chat Session',
    description: 'Create a new chat session for the authenticated user.',
    tags: ['Chat'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: createSessionSchema,
                },
            },
        },
    },
    responses: {
        201: { description: 'Session created successfully' },
        401: { description: 'Authentication required' },
        403: { description: 'Missing or invalid API key' },
    },
});

registry.registerPath({
    method: 'get',
    path: '/chat/sessions',
    summary: 'Get Chat Sessions',
    description: 'Get all chat sessions for the authenticated user.',
    tags: ['Chat'],
    security: [{ apiKey: [], bearerAuth: [] }],
    responses: {
        200: { description: 'Sessions retrieved' },
        401: { description: 'Authentication required' },
    },
});

registry.registerPath({
    method: 'get',
    path: '/chat/sessions/{sessionId}',
    summary: 'Get Chat Session',
    description: 'Get a specific chat session by ID.',
    tags: ['Chat'],
    security: [{ apiKey: [], bearerAuth: [] }],
    responses: {
        200: { description: 'Session retrieved' },
        401: { description: 'Authentication required' },
        404: { description: 'Session not found' },
    },
});

registry.registerPath({
    method: 'patch',
    path: '/chat/sessions/{sessionId}',
    summary: 'Update Chat Session',
    description: 'Update a chat session (rename, archive).',
    tags: ['Chat'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: updateSessionSchema,
                },
            },
        },
    },
    responses: {
        200: { description: 'Session updated' },
        401: { description: 'Authentication required' },
        404: { description: 'Session not found' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/chat/sessions/{sessionId}/archive',
    summary: 'Archive Chat Session',
    description: 'Archive a chat session.',
    tags: ['Chat'],
    security: [{ apiKey: [], bearerAuth: [] }],
    responses: {
        200: { description: 'Session archived' },
        401: { description: 'Authentication required' },
        404: { description: 'Session not found' },
    },
});

registry.registerPath({
    method: 'delete',
    path: '/chat/sessions/{sessionId}',
    summary: 'Delete Chat Session',
    description: 'Permanently delete a chat session.',
    tags: ['Chat'],
    security: [{ apiKey: [], bearerAuth: [] }],
    responses: {
        200: { description: 'Session deleted' },
        401: { description: 'Authentication required' },
        404: { description: 'Session not found' },
    },
});

registry.registerPath({
    method: 'post',
    path: '/chat/messages',
    summary: 'Send Message',
    description: 'Send a message to a chat session and receive AI response.',
    tags: ['Chat'],
    security: [{ apiKey: [], bearerAuth: [] }],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: sendMessageSchema,
                },
            },
        },
    },
    responses: {
        201: { description: 'Message sent and response received' },
        400: { description: 'Validation error or session archived' },
        401: { description: 'Authentication required' },
        404: { description: 'Session not found' },
    },
});

registry.registerPath({
    method: 'get',
    path: '/chat/sessions/{sessionId}/messages',
    summary: 'Get Messages',
    description: 'Get all messages for a chat session.',
    tags: ['Chat'],
    security: [{ apiKey: [], bearerAuth: [] }],
    responses: {
        200: { description: 'Messages retrieved' },
        401: { description: 'Authentication required' },
        404: { description: 'Session not found' },
    },
});

// ============================================================
// ROUTES
// ============================================================

// Session routes
router.post(
    '/sessions',
    validator(createSessionSchema, ValidationSource.BODY),
    asyncHandler(ChatController.createSession),
);

router.get(
    '/sessions',
    validator(getSessionsQuerySchema, ValidationSource.QUERY),
    asyncHandler(ChatController.getSessions),
);

router.get(
    '/sessions/:sessionId',
    validator(sessionIdParamSchema, ValidationSource.PARAM),
    asyncHandler(ChatController.getSession),
);

router.patch(
    '/sessions/:sessionId',
    validator(sessionIdParamSchema, ValidationSource.PARAM),
    validator(updateSessionSchema, ValidationSource.BODY),
    asyncHandler(ChatController.updateSession),
);

router.post(
    '/sessions/:sessionId/archive',
    validator(sessionIdParamSchema, ValidationSource.PARAM),
    asyncHandler(ChatController.archiveSession),
);

router.delete(
    '/sessions/:sessionId',
    validator(sessionIdParamSchema, ValidationSource.PARAM),
    asyncHandler(ChatController.deleteSession),
);

// Message routes
router.post(
    '/messages',
    validator(sendMessageSchema, ValidationSource.BODY),
    asyncHandler(ChatController.sendMessage),
);

router.get(
    '/sessions/:sessionId/messages',
    validator(sessionIdParamSchema, ValidationSource.PARAM),
    validator(getMessagesQuerySchema, ValidationSource.QUERY),
    asyncHandler(ChatController.getMessages),
);

export default router;
