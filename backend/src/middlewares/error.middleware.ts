import { NextFunction, Request, Response } from 'express';
import logger from './../core/logger.js';
import { isProduction } from './../config.js';
import { ApiError, ErrorType } from '../core/api-error.js';

export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction,
) => {
    let statusCode = 500;
    let message = 'Something went wrong';
    const errors: string[] = [];

    logger.error('Error:', {
        error: err,
    });

    if (err instanceof ApiError) {
        ApiError.handle(err, res);
        if (err.type === ErrorType.INTERNAL)
            logger.error(
                `500 - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`,
            );
        return;
    }

    if (!isProduction) {
        message = err?.message || message;
        errors.push(err?.message);
    }

    res.status(statusCode).json({
        success: false,
        statusCode,
        message,
        ...(errors.length > 0 && !isProduction && { errors }),
        timeStamp: new Date().toISOString(),
        path: req.originalUrl,
    });
};
