import { z } from 'zod';
import { registry } from '../../../swagger-docs/swagger';

// API uses lowercase platform names (BACKEND_API.md §5.7); DB stores uppercase
// to match the Prisma enum convention. Mapping happens in the service.
export const platformSchema = z.enum(['ios', 'android', 'web']);

export const registerDeviceTokenSchema = z.object({
    platform: platformSchema,
    token: z.string().trim().min(1).max(512),
    deviceName: z.string().trim().min(1).max(255).optional(),
    appVersion: z.string().trim().min(1).max(50).optional(),
});

export const unregisterDeviceTokenSchema = z.object({
    token: z.string().trim().min(1).max(512),
});

registry.register('RegisterDeviceTokenSchema', registerDeviceTokenSchema);
registry.register('UnregisterDeviceTokenSchema', unregisterDeviceTokenSchema);

export type RegisterDeviceTokenInput = z.infer<
    typeof registerDeviceTokenSchema
>;
export type UnregisterDeviceTokenInput = z.infer<
    typeof unregisterDeviceTokenSchema
>;
