import { z } from 'zod';
import { registry } from '../../../swagger-docs/swagger';

export const notificationToggleSchema = z.object({
    enabled: z.boolean(),
});

registry.register('SettingsNotificationToggleSchema', notificationToggleSchema);

export type NotificationToggleInput = z.infer<typeof notificationToggleSchema>;
