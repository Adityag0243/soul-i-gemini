import { Response, NextFunction } from 'express';
import { ForbiddenError } from '../core/api-error';
import { PublicRequest } from '../types/app-requests';
import { Permission } from '@prisma/client';

export default (permission: string) =>
    (req: PublicRequest, _res: Response, next: NextFunction) => {
        try {
            if (!req.apiKey?.permissions)
                return next(new ForbiddenError('Permission Denied'));

            const exists = req.apiKey.permissions.find(
                (entry: Permission) => entry === permission,
            );
            if (!exists) return next(new ForbiddenError('Permission Denied'));

            next();
        } catch (error) {
            next(error);
        }
    };
