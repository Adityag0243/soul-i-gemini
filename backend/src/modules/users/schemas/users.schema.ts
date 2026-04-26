import { z } from 'zod';
import { registry } from '../../../swagger-docs/swagger';

// Allowed gender values per D3 / BACKEND_API.md §5.2.
const genderSchema = z.enum([
    'male',
    'female',
    'non_binary',
    'prefer_not_to_say',
]);

export const updateMeSchema = z
    .object({
        name: z.string().trim().min(1).max(255).optional(),
        callName: z.string().trim().min(1).max(50).optional(),
        country: z
            .string()
            .trim()
            .length(2, 'country must be ISO 3166-1 alpha-2')
            .toUpperCase()
            .optional(),
        timezone: z.string().trim().min(1).max(64).optional(),
        locale: z.string().trim().min(2).max(10).optional(),
        // YYYY-MM-DD only — coerce to a real Date in the service after the regex check.
        dateOfBirth: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD')
            .optional(),
        gender: genderSchema.optional(),
        preferredVoice: z.string().trim().min(1).max(100).optional(),
        pushNotificationsEnabled: z.boolean().optional(),
        emailNotificationsEnabled: z.boolean().optional(),
        onboardingCompleted: z.boolean().optional(),
    })
    // Don't accept an empty object — there's nothing to do and silently
    // succeeding hides client bugs.
    .refine((v) => Object.keys(v).length > 0, {
        message: 'At least one updatable field is required',
    });

registry.register('UpdateMeSchema', updateMeSchema);

export type UpdateMeInput = z.infer<typeof updateMeSchema>;

// Onboarding-only call-name setter (BACKEND_API.md §5.4). Same length bounds
// as updateMeSchema.callName so they stay in sync.
export const setCallNameSchema = z.object({
    callName: z.string().trim().min(1).max(50),
});

registry.register('SetCallNameSchema', setCallNameSchema);

export type SetCallNameInput = z.infer<typeof setCallNameSchema>;
