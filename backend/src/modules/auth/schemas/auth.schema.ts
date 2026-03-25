import { z } from 'zod';
import { registry } from '../../../swagger-docs/swagger';

// Email Registration Schema
export const emailRegisterSchema = z.object({
    name: z.string().min(1, 'Name is required').max(255),
    email: z.string().email('Invalid email format'),
    password: z
        .string()
        .min(8, 'Password must be at least 8 characters')
        .max(128)
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
            'Password must contain at least one uppercase letter, one lowercase letter, and one number',
        ),
});

// Email Login Schema
export const emailLoginSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
});

// Google Login Schema
export const googleLoginSchema = z.object({
    idToken: z.string().min(1, 'Google ID token is required'),
});

// Anonymous Login Schema
export const anonymousLoginSchema = z.object({
    name: z.string().max(255).optional(),
});

// Souli Key Restore Schema (for anonymous users to restore their session)
export const souliKeyRestoreSchema = z.object({
    souliKey: z.string().min(1, 'Souli key is required'),
});

// Link Provider Schema
export const linkProviderSchema = z.object({
    provider: z.enum(['GOOGLE', 'EMAIL']),
    idToken: z.string().optional(), // For Google
    email: z.string().email().optional(), // For Email
    password: z.string().min(8).optional(), // For Email
});

// Refresh Token Schema
export const refreshTokenSchema = z
    .object({
        body: z
            .object({
                refreshToken: z.string().min(1).optional(),
            })
            .optional(),
        cookies: z
            .object({
                refreshToken: z.string().min(1).optional(),
            })
            .optional(),
    })
    .refine(
        (data) =>
            Boolean(data.body?.refreshToken || data.cookies?.refreshToken),
        {
            message: 'Refresh token is required either in body or in cookies.',
        },
    );

// Register schemas with OpenAPI registry
registry.register('EmailRegisterSchema', emailRegisterSchema);
registry.register('EmailLoginSchema', emailLoginSchema);
registry.register('GoogleLoginSchema', googleLoginSchema);
registry.register('AnonymousLoginSchema', anonymousLoginSchema);
registry.register('SouliKeyRestoreSchema', souliKeyRestoreSchema);

export type EmailRegisterInput = z.infer<typeof emailRegisterSchema>;
export type EmailLoginInput = z.infer<typeof emailLoginSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
export type AnonymousLoginInput = z.infer<typeof anonymousLoginSchema>;
export type SouliKeyRestoreInput = z.infer<typeof souliKeyRestoreSchema>;
export type LinkProviderInput = z.infer<typeof linkProviderSchema>;
