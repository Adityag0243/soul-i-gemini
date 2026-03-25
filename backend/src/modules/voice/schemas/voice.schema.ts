import { z } from 'zod';
import { registry } from '../../../swagger-docs/swagger';

export const createVoiceTokenSchema = z.object({
    roomName: z
        .string()
        .min(3, 'roomName must be at least 3 characters')
        .max(128, 'roomName is too long')
        .regex(/^[a-zA-Z0-9_-]+$/, 'roomName contains invalid characters')
        .optional(),
    sessionId: z.string().uuid('Invalid session ID').optional(),
    participantName: z.string().min(1).max(80).optional(),
    platform: z.enum(['ios', 'android', 'web']).optional().default('web'),
});

export const createVoiceBootstrapSchema = z.object({
    sessionId: z.string().uuid('Invalid session ID').optional(),
    roomName: z
        .string()
        .min(3, 'roomName must be at least 3 characters')
        .max(128, 'roomName is too long')
        .regex(/^[a-zA-Z0-9_-]+$/, 'roomName contains invalid characters')
        .optional(),
    participantName: z.string().min(1).max(80).optional(),
    platform: z.enum(['ios', 'android', 'web']).optional().default('web'),
});

registry.register('CreateVoiceTokenSchema', createVoiceTokenSchema);
registry.register('CreateVoiceBootstrapSchema', createVoiceBootstrapSchema);

export type CreateVoiceTokenInput = z.infer<typeof createVoiceTokenSchema>;
export type CreateVoiceBootstrapInput = z.infer<
    typeof createVoiceBootstrapSchema
>;
