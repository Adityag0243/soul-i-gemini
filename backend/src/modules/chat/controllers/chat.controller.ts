import { Response } from 'express';
import {
    SuccessResponse,
    SuccessCreatedResponse,
} from '../../../core/api-response';
import { ProtectedRequest } from '../../../types/app-requests';
import ChatService from '../services/chat.service';
import {
    CreateSessionInput,
    UpdateSessionInput,
    SendMessageInput,
    SaveVoiceTranscriptInput,
    GetSessionsQuery,
    GetMessagesQuery,
    CompleteSessionInput,
    MarkCouponPopupShownInput,
} from '../schemas/chat.schema';

//create a new chat session
// POST /chat/sessions

export async function createSession(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const input = req.body as CreateSessionInput;
    const session = await ChatService.createSession(req.user.id, input);

    new SuccessCreatedResponse('Chat session created', session).send(res);
}

//get all chat sessions for the current user
// GET /chat/sessions

export async function getSessions(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const query = req.query as unknown as GetSessionsQuery;

    const result = await ChatService.getSessions(req.user.id, {
        includeArchived: query.includeArchived,
        limit: query.limit,
        offset: query.offset,
    });

    new SuccessResponse('Sessions retrieved', result).send(res);
}

//get a specific chat session
// GET /chat/sessions/:sessionId

export async function getSession(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const { sessionId } = req.params;
    const session = await ChatService.getSession(sessionId, req.user.id);

    new SuccessResponse('Session retrieved', session).send(res);
}

// update a chat session (rename, archive)
// PATCH /chat/sessions/:sessionId

export async function updateSession(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const { sessionId } = req.params;
    const input = req.body as UpdateSessionInput;

    const session = await ChatService.updateSession(
        sessionId,
        req.user.id,
        input,
    );

    new SuccessResponse('Session updated', session).send(res);
}

// archive a chat session
// POST /chat/sessions/:sessionId/archive

export async function archiveSession(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const { sessionId } = req.params;
    const session = await ChatService.archiveSession(sessionId, req.user.id);

    new SuccessResponse('Session archived', session).send(res);
}

// delete a chat session
// DELETE /chat/sessions/:sessionId

export async function deleteSession(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const { sessionId } = req.params;
    await ChatService.deleteSession(sessionId, req.user.id);

    new SuccessResponse('Session deleted', null).send(res);
}

//send a message and get AI response
//POST /chat/messages

export async function sendMessage(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const input = req.body as SendMessageInput;
    const result = await ChatService.sendMessage(req.user.id, input);

    new SuccessCreatedResponse('Message sent', result).send(res);
}

// save voice transcript messages into chat history
// POST /chat/messages/voice-transcript

export async function saveVoiceTranscript(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const input = req.body as SaveVoiceTranscriptInput;
    const result = await ChatService.saveVoiceTranscript(req.user.id, input);

    new SuccessCreatedResponse('Voice transcript saved', result).send(res);
}

//get messages for a session
//GET /chat/sessions/:sessionId/messages
export async function getMessages(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const { sessionId } = req.params;
    const query = req.query as unknown as GetMessagesQuery;

    const result = await ChatService.getMessages(sessionId, req.user.id, {
        limit: query.limit,
        offset: query.offset,
    });

    new SuccessResponse('Messages retrieved', result).send(res);
}

// FREE SESSION MANAGEMENT

// Get free session status for current user
// GET /chat/sessions/status/free

export async function getFreeSessionStatus(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const status = await ChatService.getFreeSessionStatus(req.user.id);

    new SuccessResponse('Free session status retrieved', status).send(res);
}

// Mark session as complete and increment free session counter
// POST /chat/sessions/:sessionId/complete

export async function completeSession(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const { sessionId } = req.params;
    const input = req.body as CompleteSessionInput;

    const result = await ChatService.completeSession(
        req.user.id,
        sessionId,
        input.phase,
        input.turnCount,
    );

    new SuccessResponse('Session completed', result).send(res);
}

// Mark coupon popup as shown for user
// POST /chat/sessions/coupon-popup/shown

export async function markCouponPopupShown(
    req: ProtectedRequest,
    res: Response,
): Promise<void> {
    const input = req.body as MarkCouponPopupShownInput;

    if (input.shown === false) {
        new SuccessResponse('Coupon popup marked as not shown', {
            popupShown: false,
            message: 'Status updated',
        }).send(res);
        return;
    }

    const result = await ChatService.markCouponPopupShown(req.user.id);

    new SuccessResponse('Coupon popup marked as shown', result).send(res);
}
