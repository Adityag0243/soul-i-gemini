import { Response } from 'express';
import { SuccessResponse } from '../../../core/api-response';
import { ProtectedRequest } from '../../../types/app-requests';
import VoiceService from '../services/voice.service';
import { CreateVoiceTokenInput } from '../schemas/voice.schema';

export async function createVoiceToken(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const input = req.body as CreateVoiceTokenInput;
    const result = await VoiceService.createVoiceToken(req.user.id, input);

    new SuccessResponse('Voice token created', result).send(res);
}
