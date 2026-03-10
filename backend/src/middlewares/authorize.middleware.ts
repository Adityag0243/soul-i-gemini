import { RequestHandler } from 'express';
import { ProtectedRequest } from '../types/app-requests';
import { ForbiddenError } from '../core/api-error';
import { RoleCode } from '@prisma/client';

export const authorize = (...allowedRoles: RoleCode[]): RequestHandler => {
    return (req, _res, next) => {
        try {
            const protectedReq = req as ProtectedRequest;

            if (!protectedReq.user) {
                throw new ForbiddenError('Authentication required');
            }

            // Check if user has any of the allowed roles
            const userRoleCodes = protectedReq.user.roles.map(
                (role) => role.code,
            );
            const hasAllowedRole = allowedRoles.some((role) =>
                userRoleCodes.includes(role),
            );

            if (!hasAllowedRole) {
                throw new ForbiddenError(
                    `Forbidden: required roles [${allowedRoles.join(', ')}], found: [${userRoleCodes.join(', ')}]`,
                );
            }

            next();
        } catch (error) {
            next(error);
        }
    };
};
