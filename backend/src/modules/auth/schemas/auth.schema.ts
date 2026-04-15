import { z } from 'zod';
import { registry } from '../../../swagger-docs/swagger';
import { ZodAuthBearer, ZodCookies } from '../../../helpers/validator';

const passwordSchema = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    );

const SOULI_KEY_LENGTH = 6;

// email registration schema
export const emailRegisterSchema = z.object({
    name: z.string().min(1, 'Name is required').max(255),
    email: z.string().email('Invalid email format'),
    password: passwordSchema,
});

// email Login Schema
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

// Souli Key Restore Schema
export const souliKeyRestoreSchema = z.object({
    souliKey: z
        .union([
            z
                .string()
                .length(
                    SOULI_KEY_LENGTH,
                    'Souli key must be exactly 6 characters',
                ),
        ])
        .describe('Souli key generated during anonymous login'),
});

// Reset Journey Schema
export const resetJourneySchema = z.object({
    confirm: z.literal('RESET_JOURNEY'),
});

// Erase All Data Schema
export const eraseAllDataSchema = z.object({
    confirm: z.literal('ERASE_ALL_DATA'),
});

// Link Provider Schema
export const linkProviderSchema = z.object({
    provider: z.enum(['GOOGLE', 'EMAIL']),
    idToken: z.string().optional(), // for Google
    email: z.string().email().optional(), // for Email
    password: z.string().min(8).optional(), // For Email
});

export const forgotPasswordRequestSchema = z.object({
    email: z.string().email('Invalid email format'),
});

export const forgotPasswordVerifySchema = z.object({
    email: z.string().email('Invalid email format'),
    otp: z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
});

export const forgotPasswordResetSchema = z
    .object({
        resetToken: z.string().min(1, 'Reset token is required'),
        newPassword: passwordSchema,
        confirmPassword: z.string().min(1, 'Confirm password is required'),
    })
    .refine((data) => data.newPassword === data.confirmPassword, {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
    });

export const authRequestSchema = z
    .object({
        headers: z.object({
            authorization: ZodAuthBearer.optional(),
        }),
        cookies: ZodCookies.optional(),
    })
    .refine(
        (data) =>
            Boolean(data.headers.authorization) ||
            Boolean(data.cookies?.accessToken),
        {
            message:
                'Token is required either in Authorization header or in cookies',
        },
    );

// refresh Token Schema
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

// register schemas with OpenAPI registry
registry.register('EmailRegisterSchema', emailRegisterSchema);
registry.register('EmailLoginSchema', emailLoginSchema);
registry.register('GoogleLoginSchema', googleLoginSchema);
registry.register('AnonymousLoginSchema', anonymousLoginSchema);
registry.register('SouliKeyRestoreSchema', souliKeyRestoreSchema);
registry.register('ResetJourneySchema', resetJourneySchema);
registry.register('EraseAllDataSchema', eraseAllDataSchema);
registry.register('ForgotPasswordRequestSchema', forgotPasswordRequestSchema);
registry.register('ForgotPasswordVerifySchema', forgotPasswordVerifySchema);
registry.register('ForgotPasswordResetSchema', forgotPasswordResetSchema);
registry.register('AuthRequestSchema', authRequestSchema);

export type EmailRegisterInput = z.infer<typeof emailRegisterSchema>;
export type EmailLoginInput = z.infer<typeof emailLoginSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
export type AnonymousLoginInput = z.infer<typeof anonymousLoginSchema>;
export type SouliKeyRestoreInput = z.infer<typeof souliKeyRestoreSchema>;
export type ResetJourneyInput = z.infer<typeof resetJourneySchema>;
export type EraseAllDataInput = z.infer<typeof eraseAllDataSchema>;
export type LinkProviderInput = z.infer<typeof linkProviderSchema>;
export type ForgotPasswordRequestInput = z.infer<
    typeof forgotPasswordRequestSchema
>;
export type ForgotPasswordVerifyInput = z.infer<
    typeof forgotPasswordVerifySchema
>;
export type ForgotPasswordResetInput = z.infer<
    typeof forgotPasswordResetSchema
>;
