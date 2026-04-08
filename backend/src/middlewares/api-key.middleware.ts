import { Response, NextFunction } from 'express';
import z from 'zod';
import { validator } from './validator.middleware';
import { ValidationSource } from '../helpers/validator';
import { asyncHandler } from '../core/async-handler';
import { PublicRequest } from '../types/app-requests';
import { ForbiddenError } from '../core/api-error';
import { Header } from '../core/utils';
import ApiKeyRepo from '../database/repositories/api-key.repo';

const apiKeySchema = z.object({
    [Header.API_KEY]: z.string(),
});

export const apiKeyMiddleware = [
    validator(apiKeySchema, ValidationSource.HEADER),

    asyncHandler<PublicRequest>(
        async (req: PublicRequest, _res: Response, next: NextFunction) => {
            const key = req.headers[Header.API_KEY]?.toString();

            if (!key) throw new ForbiddenError('Missing API Key');

            const apiKey = await ApiKeyRepo.findByKey(key);

            if (!apiKey) throw new ForbiddenError('Invalid API Key');

            req.apiKey = apiKey;

            next();
        },
    ),
];
