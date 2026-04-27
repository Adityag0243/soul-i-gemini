import { Request, Response } from 'express';
import { SuccessResponse } from '../../../core/api-response';
import { handleEvent } from '../services/ai-event.service';
import { AiEvent } from '../schemas/ai-event.schema';

export async function receiveEvent(
    req: Request,
    res: Response,
): Promise<void> {
    const event = req.body as AiEvent;
    await handleEvent(event);
    new SuccessResponse('Event processed', { type: event.type }).send(res);
}
