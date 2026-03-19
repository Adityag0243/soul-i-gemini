import { Response } from 'express';
import { SuccessResponse } from '../../../core/api-response';
import { ProtectedRequest } from '../../../types/app-requests';
import VoiceService from '../services/voice.service';
import {
    CreateVoiceTokenInput,
    CreateVoiceBootstrapInput,
} from '../schemas/voice.schema';

export async function createVoiceToken(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const input = req.body as CreateVoiceTokenInput;
    const result = await VoiceService.createVoiceToken(req.user.id, input);

    new SuccessResponse('Voice token created', result).send(res);
}

export async function createVoiceBootstrap(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const input = req.body as CreateVoiceBootstrapInput;
    const result = await VoiceService.createVoiceBootstrap(req.user.id, input);

    new SuccessResponse('Voice bootstrap created', result).send(res);
}
