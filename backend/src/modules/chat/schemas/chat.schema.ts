import { z } from 'zod';
import { registry } from '../../../docs/swagger';

// Create Chat Session Schema
export const createSessionSchema = z.object({
    title: z.string().max(255).optional(),
});

// Update Chat Session Schema
export const updateSessionSchema = z.object({
    title: z.string().max(255).optional(),
    isArchived: z.boolean().optional(),
});

// Get Sessions Query Schema
export const getSessionsQuerySchema = z.object({
    includeArchived: z
        .string()
        .transform((val) => val === 'true')
        .optional(),
    limit: z
        .string()
        .transform(Number)
        .pipe(z.number().min(1).max(100))
        .optional(),
    offset: z.string().transform(Number).pipe(z.number().min(0)).optional(),
});

// Session ID Param Schema
export const sessionIdParamSchema = z.object({
    sessionId: z.string().uuid('Invalid session ID'),
});

// Send Message Schema
export const sendMessageSchema = z.object({
    sessionId: z.string().uuid('Invalid session ID'),
    content: z
        .string()
        .min(1, 'Message content is required')
        .max(10000, 'Message too long'),
});

// Get Messages Query Schema
export const getMessagesQuerySchema = z.object({
    limit: z
        .string()
        .transform(Number)
        .pipe(z.number().min(1).max(100))
        .optional(),
    offset: z.string().transform(Number).pipe(z.number().min(0)).optional(),
});

// Register schemas with OpenAPI registry
registry.register('CreateSessionSchema', createSessionSchema);
registry.register('UpdateSessionSchema', updateSessionSchema);
registry.register('SendMessageSchema', sendMessageSchema);

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type GetSessionsQuery = z.infer<typeof getSessionsQuerySchema>;
export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type GetMessagesQuery = z.infer<typeof getMessagesQuerySchema>;
