import { Header } from './../../core/utils';
import { ZodAuthBearer, ZodCookies } from './../../helpers/validator';
import z from 'zod';
import { registry } from '../../docs/swagger';

const apiKey = z.object({
    [Header.API_KEY]: z.string(),
});

const auth = z
    .object({
        headers: z.object({
            authorization: ZodAuthBearer.optional(),
        }),
        cookies: ZodCookies.optional(),
    })
    .refine(
        (data) => {
            return (
                Boolean(data.headers.authorization) ||
                Boolean(data.cookies?.accessToken)
            );
        },
        {
            message:
                'Token is required either in Authorization header or in cookies',
            // path: ['headers', 'authorization'],
        },
    );

const signup = z.object({
    name: z.string().min(3),
    email: z.email(),
    password: z.string().min(6),
});

const signin = z.object({
    email: z.email(),
    password: z.string().min(6),
});

const refreshToken = z
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

export default {
    apiKey,
    auth,
    signup,
    signin,
    refreshToken,
};

registry.register('SignupSchema', signup);
registry.register('SigninSchema', signin);