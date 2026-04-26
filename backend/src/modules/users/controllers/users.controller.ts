import { Response } from 'express';
import { SuccessResponse } from '../../../core/api-response';
import { InternalError } from '../../../core/api-error';
import { ProtectedRequest } from '../../../types/app-requests';
import { serializeUserById } from '../serializers/user.serializer';

// GET /users/me
export async function getMe(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const user = await serializeUserById(req.user.id);
    if (!user) {
        // authMiddleware loaded this user; if it's gone now, that's a server bug.
        throw new InternalError('Authenticated user not found');
    }
    new SuccessResponse('User retrieved', user).send(res);
}
