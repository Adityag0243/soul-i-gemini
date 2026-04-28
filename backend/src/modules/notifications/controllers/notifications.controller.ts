import { Response } from 'express';
import {
    SuccessCreatedResponse,
    SuccessResponse,
} from '../../../core/api-response';
import { ProtectedRequest } from '../../../types/app-requests';
import NotificationsService from '../services/notifications.service';
import {
    RegisterDeviceTokenInput,
    UnregisterDeviceTokenInput,
} from '../schemas/notifications.schema';

// POST /notifications/token
export async function registerToken(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const input = req.body as RegisterDeviceTokenInput;
    const deviceToken = await NotificationsService.registerToken(
        req.user.id,
        input,
    );
    new SuccessCreatedResponse('Device token registered', {
        deviceToken,
    }).send(res);
}

// DELETE /notifications/token
export async function unregisterToken(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const input = req.body as UnregisterDeviceTokenInput;
    await NotificationsService.unregisterToken(req.user.id, input);
    new SuccessResponse('Device token removed', null).send(res);
}
