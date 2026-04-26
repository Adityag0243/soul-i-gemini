import { Response } from 'express';
import { SuccessResponse } from '../../../core/api-response';
import { InternalError } from '../../../core/api-error';
import { ProtectedRequest } from '../../../types/app-requests';
import { serializeUserById } from '../serializers/user.serializer';
import UsersService from '../services/users.service';
import { UpdateMeInput } from '../schemas/users.schema';

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

// PATCH /users/me
export async function updateMe(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const input = req.body as UpdateMeInput;
    const user = await UsersService.updateMe(req.user.id, input);
    new SuccessResponse('User updated', user).send(res);
}
