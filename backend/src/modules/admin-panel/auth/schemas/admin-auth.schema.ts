import { z } from 'zod';
import { ZodAuthBearer, ZodCookies } from '../../../../helpers/validator';

export const adminEmailLoginSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
});

export const adminAuthRequestSchema = z
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

export const adminRefreshTokenSchema = z
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

export type AdminEmailLoginInput = z.infer<typeof adminEmailLoginSchema>;
