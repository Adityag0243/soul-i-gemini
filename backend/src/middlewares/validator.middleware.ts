import { RequestHandler } from 'express';
import z, { ZodSchema } from 'zod';

import { BadRequestError } from '../core/api-error';
import { ValidationSource } from './../helpers/validator';
import logger from '../core/logger';

export const validator = (
    schema: ZodSchema,
    source: ValidationSource,
): RequestHandler => {
    return (req, _res, next): void => {
        const schemaToBeValidated =
            source === ValidationSource.REQUEST ? req : req[source];

        const result = schema.safeParse(schemaToBeValidated);

        if (!result.success) {
            logger.warn('Validation error', result.error);
            return next(new BadRequestError(z.prettifyError(result.error)));
        }
        next();
    };
};
