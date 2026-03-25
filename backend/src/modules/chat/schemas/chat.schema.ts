import { z } from 'zod';
import { registry } from '../../../swagger-docs/swagger';

// create chat session schema
export const createSessionSchema = z.object({
    title: z.string().max(255).optional(),
});

// update chat session
export const updateSessionSchema = z.object({
    title: z.string().max(255).optional(),
    isArchived: z.boolean().optional(),
});

// get sessions query
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

// session id Param schema
export const sessionIdParamSchema = z.object({
    sessionId: z.string().uuid('Invalid session ID'),
});

// send message
export const sendMessageSchema = z.object({
    sessionId: z.string().uuid('Invalid session ID'),
    content: z
        .string()
        .min(1, 'Message content is required')
        .max(10000, 'Message too long'),
});

// save voice transcript schema
export const saveVoiceTranscriptSchema = z.object({
    sessionId: z.string().uuid('Invalid session ID'),
    userTranscript: z
        .string()
        .min(1, 'User transcript is required')
        .max(10000, 'User transcript too long'),
    assistantTranscript: z
        .string()
        .min(1, 'Assistant transcript cannot be empty')
        .max(10000, 'Assistant transcript too long')
        .optional(),
    assistantTokenCount: z.number().int().min(0).optional(),
    detectedEmotion: z
        .string()
        .min(1, 'Emotion cannot be empty')
        .max(100)
        .optional(),
    crisisLevel: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']).optional(),
});

// get messages query schema
export const getMessagesQuerySchema = z.object({
    limit: z
        .string()
        .transform(Number)
        .pipe(z.number().min(1).max(100))
        .optional(),
    offset: z.string().transform(Number).pipe(z.number().min(0)).optional(),
});

// register schemas with OpenAPI registry
registry.register('CreateSessionSchema', createSessionSchema);
registry.register('UpdateSessionSchema', updateSessionSchema);
registry.register('SendMessageSchema', sendMessageSchema);
registry.register('SaveVoiceTranscriptSchema', saveVoiceTranscriptSchema);

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
export type GetSessionsQuery = z.infer<typeof getSessionsQuerySchema>;
export type SessionIdParam = z.infer<typeof sessionIdParamSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type SaveVoiceTranscriptInput = z.infer<
    typeof saveVoiceTranscriptSchema
>;
export type GetMessagesQuery = z.infer<typeof getMessagesQuerySchema>;
