import z from 'zod';

export enum ValidationSource {
    BODY = 'body',
    HEADER = 'headers',
    QUERY = 'query',
    PARAM = 'params',
    REQUEST = 'request',
}

export enum CookieKeys {
    ACCESS_TOKEN = 'accessToken',
    REFRESH_TOKEN = 'refreshToken',
}

export const ZodUserId = z.string().refine(
    (value: string) => {
        const num = parseInt(value, 10);
        return !isNaN(num) && num > 0;
    },
    {
        message: 'Invalid user ID. Must be a positive integer.',
    },
);

export const ZodUrlEndpoint = z
    .string()
    .refine((value: string) => !value.includes('://'), {
        message: 'Invalid endpoint: URLs with protocol are not allowed',
    });

export const ZodAuthBearer = z.string().refine(
    (value: string) => {
        if (!value.startsWith('Bearer ')) return false;

        const parts = value.split(' ');
        if (parts.length !== 2) return false;

        const token = parts[1];
        if (!token || token.trim().length === 0) return false;

        return true;
    },
    {
        message: "Invalid Authorization header. Expected: 'Bearer <token>'",
    },
);

export const ZodCookies = z.object({
    accessToken: z.string().optional(),
    refreshToken: z.string().optional(),
});
