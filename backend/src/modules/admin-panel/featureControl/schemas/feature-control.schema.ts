import { z } from 'zod';
import { FeatureKey } from '@prisma/client';
import { registry } from '../../../../swagger-docs/swagger';

export const featureToggleSchema = z.object({
    enabled: z.boolean(),
});

export const featureKeyParamSchema = z.object({
    featureKey: z.nativeEnum(FeatureKey),
});

registry.register('AdminFeatureToggleSchema', featureToggleSchema);
registry.register('AdminFeatureKeyParamSchema', featureKeyParamSchema);

export type FeatureToggleInput = z.infer<typeof featureToggleSchema>;
export type FeatureKeyParam = z.infer<typeof featureKeyParamSchema>;
