import { Response } from 'express';
import { SuccessResponse } from '../../../core/api-response';
import { BadRequestError, InternalError } from '../../../core/api-error';
import { ProtectedRequest } from '../../../types/app-requests';
import { serializeUserById } from '../serializers/user.serializer';
import UsersService from '../services/users.service';
import * as insightsService from '../services/insights.service';
import { SetCallNameInput, UpdateMeInput } from '../schemas/users.schema';

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

// POST /users/me/call-name
export async function setCallName(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const input = req.body as SetCallNameInput;
    const user = await UsersService.setCallName(req.user.id, input);
    new SuccessResponse('Call name set', user).send(res);
}

// POST /users/me/avatar
export async function uploadAvatar(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    if (!req.file) {
        throw new BadRequestError('Avatar file is required (field "file")');
    }
    const result = await UsersService.uploadAvatar(req.user.id, req.file);
    new SuccessResponse('Avatar updated', result).send(res);
}

// DELETE /users/me/avatar
export async function deleteAvatar(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const user = await UsersService.deleteAvatar(req.user.id);
    new SuccessResponse('Avatar removed', user).send(res);
}

// GET /users/me/insights
export async function getInsights(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const range = (req.query.range as string) || '30d';
    const result = await insightsService.getInsights(req.user.id, range);
    new SuccessResponse('Insights retrieved', result).send(res);
}
