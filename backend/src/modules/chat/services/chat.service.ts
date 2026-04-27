import {
    MessageRole,
    CrisisLevel,
    ChatSession,
    ChatMessage,
    Prisma,
} from '@prisma/client';
import { prisma } from '../../../database';
import {
    BadRequestError,
    NotFoundError,
    PaymentRequiredError,
} from '../../../core/api-error';
import logger from '../../../core/logger';
import { subscriptionRepository } from '../../../database/repositories/subscription.repo';
import ChatSessionRepo from '../repositories/chat-session.repo';
import ChatMessageRepo from '../repositories/chat-message.repo';
import AIService, { SouliSessionState, StreamEvent } from './ai.service';
import {
    ChatSessionDto,
    ChatMessageDto,
    FreeTierStatusDto,
    SendMessageResponseDto,
    SaveVoiceTranscriptResponseDto,
    SessionListResponseDto,
    MessageListResponseDto,
} from '../dto/chat.dto';
import {
    CreateSessionInput,
    UpdateSessionInput,
    SendMessageInput,
    SaveVoiceTranscriptInput,
} from '../schemas/chat.schema';

//helper functions

type SessionWithCount = ChatSession & { _count?: { messages: number } };

function toSessionDto(session: SessionWithCount): ChatSessionDto {
    return {
        id: session.id,
        userId: session.userId,
        title: session.title,
        isArchived: session.isArchived,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        createdAt: session.createdAt,
        messageCount: session._count?.messages,
    };
}

function toMessageDto(
    message: ChatMessage,
    session: ChatSession,
): ChatMessageDto {
    return {
        id: message.id,
        sessionId: message.sessionId,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
        tokenCount: message.tokenCount,
        crisisLevel: message.crisisLevel,
        detectedEmotion: message.detectedEmotion,
        phase: message.phase,
        energyNode: message.energyNode,
        secondaryNode: message.secondaryNode,
        nodeReasoning: message.nodeReasoning,
        turnCount: message.turnCount,
        solutionStep: message.solutionStep,
        ragSources: message.ragSources,
        // Session-level signals denormalized onto the message (D5)
        isSolutionComplete: session.solutionComplete,
        threeDayTask: session.threeDayTask,
        audioUrl: message.audioUrl,
        durationMs: message.durationMs,
    };
}

async function buildFreeTierStatus(
    userId: number,
    session: ChatSession,
): Promise<FreeTierStatusDto> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
        used: user.freeSessionsCompleted,
        total: 3,
        isComplete: session.isComplete,
        showCouponPopup:
            user.freeSessionsCompleted >= 3 &&
            !user.couponPopupShown,
    };
}

//session opration

// create a new chat session
export async function createSession(
    userId: number,
    input: CreateSessionInput,
): Promise<ChatSessionDto> {
    // D12: block session creation when free tier exhausted and no active subscription.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.freeSessionsCompleted >= 3) {
        const hasPaid = await subscriptionRepository.hasActivePaidSubscription(userId);
        if (!hasPaid) {
            throw new PaymentRequiredError(
                'Free session limit reached — subscribe to continue',
            );
        }
    }

    const session = await ChatSessionRepo.create({
        userId,
        title: input.title,
    });

    logger.info('Chat session created', { sessionId: session.id, userId });

    // track analytics event
    await trackAnalyticsEvent(userId, 'session_created', {
        sessionId: session.id,
    });

    return toSessionDto(session);
}

// get all chat sessions for a user

export async function getSessions(
    userId: number,
    options?: {
        includeArchived?: boolean;
        limit?: number;
        offset?: number;
    },
): Promise<SessionListResponseDto> {
    const sessions = await ChatSessionRepo.findByUserId(userId, options);

    // get total count for pagination
    const total = await prisma.chatSession.count({
        where: {
            userId,
            ...(options?.includeArchived ? {} : { isArchived: false }),
        },
    });

    return {
        sessions: sessions.map(toSessionDto),
        total,
    };
}

// Get a single chat session
export async function getSession(
    sessionId: string,
    userId: number,
): Promise<ChatSessionDto> {
    const session = await ChatSessionRepo.findByIdAndUserId(sessionId, userId);

    if (!session) {
        throw new NotFoundError('Chat session not found');
    }

    return toSessionDto(session);
}

// update chat session (rename, archive)
export async function updateSession(
    sessionId: string,
    userId: number,
    input: UpdateSessionInput,
): Promise<ChatSessionDto> {
    // Verify ownership
    const existingSession = await ChatSessionRepo.findByIdAndUserId(
        sessionId,
        userId,
    );
    if (!existingSession) {
        throw new NotFoundError('Chat session not found');
    }

    const session = await ChatSessionRepo.update(sessionId, {
        title: input.title,
        isArchived: input.isArchived,
        endedAt: input.isArchived ? new Date() : undefined,
    });

    logger.info('Chat session updated', { sessionId, userId, changes: input });

    return toSessionDto(session);
}

// archive a chat session

export async function archiveSession(
    sessionId: string,
    userId: number,
): Promise<ChatSessionDto> {
    // Verify ownership
    const existingSession = await ChatSessionRepo.findByIdAndUserId(
        sessionId,
        userId,
    );
    if (!existingSession) {
        throw new NotFoundError('Chat session not found');
    }

    const session = await ChatSessionRepo.archive(sessionId);

    logger.info('Chat session archived', { sessionId, userId });

    return toSessionDto(session);
}

// delete a chat session (hard delete)

export async function deleteSession(
    sessionId: string,
    userId: number,
): Promise<void> {
    const existingSession = await ChatSessionRepo.findByIdAndUserId(
        sessionId,
        userId,
    );
    if (!existingSession) {
        throw new NotFoundError('Chat session not found');
    }

    await ChatSessionRepo.remove(sessionId);

    logger.info('Chat session deleted', { sessionId, userId });
}

//message operation

// send a message and get AI response

export async function sendMessage(
    userId: number,
    input: SendMessageInput,
): Promise<SendMessageResponseDto> {
    const { sessionId, content } = input;

    const session = await ChatSessionRepo.findByIdAndUserId(sessionId, userId);
    if (!session) {
        throw new NotFoundError('Chat session not found');
    }

    if (session.isArchived) {
        throw new BadRequestError('Cannot send messages to archived session');
    }

    // get recent conversation history for context
    const conversationHistory = await ChatMessageRepo.getRecentMessages(
        sessionId,
        20,
    );

    // save user message first
    const userMessage = await ChatMessageRepo.create({
        sessionId,
        role: MessageRole.USER,
        content,
        crisisLevel: AIService.detectCrisisLevel(content),
    });

    logger.info('User message saved', { sessionId, messageId: userMessage.id });

    // track chat started event if this is the first message
    const messageCount = await ChatMessageRepo.countBySessionId(sessionId);
    if (messageCount === 1) {
        await trackAnalyticsEvent(userId, 'chat_started', { sessionId });
    }

    // D12: Mark session complete on 3rd user message and increment free-tier counter.
    const userMessageCount = await ChatMessageRepo.countUserMessagesBySessionId(sessionId);
    if (userMessageCount >= 3 && !session.isComplete) {
        await prisma.$transaction([
            prisma.chatSession.update({
                where: { id: sessionId },
                data: { isComplete: true },
            }),
            prisma.user.update({
                where: { id: userId },
                data: { freeSessionsCompleted: { increment: 1 } },
            }),
        ]);
        logger.info('Session marked complete (3rd user message)', { sessionId, userId });
    }

    // generate AI response
    const aiResponse = await AIService.generateResponse(
        conversationHistory,
        content,
        sessionId,
    );

    // save assistant message — persist all AI metadata so we can serve it back
    // without re-asking AI, and so insights/cron jobs can query on it.
    const assistantMessage = await ChatMessageRepo.create({
        sessionId,
        role: MessageRole.ASSISTANT,
        content: aiResponse.content,
        tokenCount: aiResponse.tokenCount,
        crisisLevel: aiResponse.crisisLevel,
        phase: aiResponse.phase,
        energyNode: aiResponse.energyNode,
        secondaryNode: aiResponse.secondaryNode,
        nodeReasoning: aiResponse.nodeReasoning,
        turnCount: aiResponse.turnCount,
        solutionStep: aiResponse.solutionStep,
        ragSources: aiResponse.ragSources,
        detectedEmotion: aiResponse.detectedEmotion,
    });

    logger.info('Assistant message saved', {
        sessionId,
        messageId: assistantMessage.id,
        crisisLevel: aiResponse.crisisLevel,
    });

    // Mirror AI state onto the session row so GET /sessions/{id} can serve
    // the latest phase/energyNode/etc. without scanning messages, and so
    // cron jobs (Phase 9 auto-archive, Phase 11 insights) can filter on
    // lastActivityAt directly.
    try {
        await ChatSessionRepo.applyAssistantMessageMetadata(sessionId, {
            phase: aiResponse.phase,
            energyNode: aiResponse.energyNode,
            secondaryNode: aiResponse.secondaryNode,
            solutionStep: aiResponse.solutionStep,
            tokensUsed: aiResponse.tokenCount,
        });
    } catch (error) {
        logger.error('Failed to mirror AI metadata onto session', {
            sessionId,
            error,
        });
    }

    // Handle crisis detection
    if (
        aiResponse.crisisLevel === CrisisLevel.HIGH ||
        aiResponse.crisisLevel === CrisisLevel.MEDIUM
    ) {
        await handleCrisisEvent(
            userId,
            sessionId,
            userMessage.id,
            aiResponse.crisisLevel,
        );
    }

    // store emotional state if detected
    if (aiResponse.detectedEmotion) {
        await storeEmotionalState(
            userId,
            sessionId,
            aiResponse.detectedEmotion,
        );
    }

    // auto-update session title if it's the default and this is the first exchange
    if (session.title === 'New Chat' && messageCount <= 2) {
        const newTitle = await generateSessionTitle(content);
        if (newTitle) {
            await ChatSessionRepo.update(sessionId, { title: newTitle });
        }
    }

    // Re-fetch the session so the response reflects the just-mirrored AI state
    // and any title update.
    const updatedSession =
        (await ChatSessionRepo.findById(sessionId)) ?? session;

    return {
        userMessage: toMessageDto(userMessage, updatedSession),
        aiMessage: toMessageDto(assistantMessage, updatedSession),
        session: toSessionDto(updatedSession),
        crisisResources: null,
        freeTier: await buildFreeTierStatus(userId, updatedSession),
    };
}

// Save a voice transcript exchange into chat history

export async function saveVoiceTranscript(
    userId: number,
    input: SaveVoiceTranscriptInput,
): Promise<SaveVoiceTranscriptResponseDto> {
    const { sessionId, userTranscript, assistantTranscript } = input;

    const session = await ChatSessionRepo.findByIdAndUserId(sessionId, userId);
    if (!session) {
        throw new NotFoundError('Chat session not found');
    }

    if (session.isArchived) {
        throw new BadRequestError(
            'Cannot save transcripts to archived session',
        );
    }

    const userCrisisLevel = AIService.detectCrisisLevel(userTranscript);

    const userMessage = await ChatMessageRepo.create({
        sessionId,
        role: MessageRole.USER,
        content: userTranscript,
        crisisLevel: userCrisisLevel,
    });

    let assistantMessage: ChatMessage | null = null;
    if (assistantTranscript) {
        assistantMessage = await ChatMessageRepo.create({
            sessionId,
            role: MessageRole.ASSISTANT,
            content: assistantTranscript,
            tokenCount: input.assistantTokenCount,
            crisisLevel:
                input.crisisLevel ??
                AIService.detectCrisisLevel(assistantTranscript),
        });
    }

    if (
        userCrisisLevel === CrisisLevel.HIGH ||
        userCrisisLevel === CrisisLevel.MEDIUM
    ) {
        await handleCrisisEvent(
            userId,
            sessionId,
            userMessage.id,
            userCrisisLevel,
        );
    }

    if (input.detectedEmotion) {
        await storeEmotionalState(userId, sessionId, input.detectedEmotion);
    }

    await trackAnalyticsEvent(userId, 'voice_transcript_saved', {
        sessionId,
        hasAssistantTranscript: Boolean(assistantTranscript),
    });

    logger.info('Voice transcript saved to chat history', {
        sessionId,
        userId,
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage?.id ?? null,
    });

    return {
        userMessage: toMessageDto(userMessage, session),
        aiMessage: assistantMessage
            ? toMessageDto(assistantMessage, session)
            : null,
        session: toSessionDto(session),
    };
}

// Proxy AI session state. Verifies ownership on our side, then forwards to AI
// service GET /session/{id}/state. Response shape is whatever AI returns —
// kept passthrough so Task 2.7 (AI enrichment) doesn't require a backend change.
export async function getSessionAiState(
    sessionId: string,
    userId: number,
): Promise<SouliSessionState> {
    const session = await ChatSessionRepo.findByIdAndUserId(sessionId, userId);
    if (!session) {
        throw new NotFoundError('Chat session not found');
    }
    return AIService.getSessionState(sessionId);
}

// get messages for a session
export async function getMessages(
    sessionId: string,
    userId: number,
    options?: {
        limit?: number;
        offset?: number;
    },
): Promise<MessageListResponseDto> {
    const session = await ChatSessionRepo.findByIdAndUserId(sessionId, userId);
    if (!session) {
        throw new NotFoundError('Chat session not found');
    }

    const messages = await ChatMessageRepo.findBySessionId(sessionId, {
        limit: options?.limit ?? 50,
        offset: options?.offset,
        order: 'asc',
    });

    const total = await ChatMessageRepo.countBySessionId(sessionId);

    return {
        messages: messages.map((m) => toMessageDto(m, session)),
        total,
        sessionId,
    };
}

//helper functions

//Handle crisis event detection

async function handleCrisisEvent(
    userId: number,
    sessionId: string,
    triggerMessageId: string,
    level: CrisisLevel,
): Promise<void> {
    try {
        await prisma.crisisEvent.create({
            data: {
                userId,
                sessionId,
                triggerMessageId,
                level,
            },
        });

        logger.warn('Crisis event recorded', { userId, sessionId, level });

        // track analytics
        await trackAnalyticsEvent(userId, 'crisis_detected', {
            sessionId,
            level,
            triggerMessageId,
        });
    } catch (error) {
        logger.error('Failed to record crisis event:', error);
    }
}

// Store detected emotional state

async function storeEmotionalState(
    userId: number,
    sessionId: string,
    emotion: string,
): Promise<void> {
    try {
        await prisma.emotionalState.create({
            data: {
                userId,
                sessionId,
                detectedEmotion: emotion,
            },
        });
    } catch (error) {
        logger.error('Failed to store emotional state:', error);
    }
}

// Generate a short title from the first message

async function generateSessionTitle(
    firstMessage: string,
): Promise<string | null> {
    // simple title generation - take first 50 chars
    const title = firstMessage.trim().slice(0, 50);
    if (title.length < firstMessage.length) {
        return title + '...';
    }
    return title || null;
}

//track analytics event

async function trackAnalyticsEvent(
    userId: number,
    eventName: string,
    metadata?: Prisma.InputJsonObject,
): Promise<void> {
    try {
        await prisma.analyticsEvent.create({
            data: {
                userId,
                eventName,
                metadata: metadata ?? {},
            },
        });
    } catch (error) {
        logger.error('Failed to track analytics event:', error);
    }
}

export async function getFreeTierStatus(userId: number) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const hasPaid = await subscriptionRepository.hasActivePaidSubscription(userId);
    return {
        used: user.freeSessionsCompleted,
        total: 3,
        blocked: user.freeSessionsCompleted >= 3 && !hasPaid,
        showCouponPopup: user.freeSessionsCompleted >= 3 && !user.couponPopupShown,
    };
}

export async function acknowledgeCouponPopup(userId: number): Promise<void> {
    await prisma.user.update({
        where: { id: userId },
        data: { couponPopupShown: true },
    });
}

// ── SSE streaming send (T9 — Phase 12.2) ───────────────────────────────────

export interface SSEFrame {
    event: string;
    data: unknown;
}

export async function* sendMessageStream(
    userId: number,
    input: SendMessageInput,
): AsyncGenerator<SSEFrame> {
    const { sessionId, content } = input;

    const session = await ChatSessionRepo.findByIdAndUserId(sessionId, userId);
    if (!session) throw new NotFoundError('Chat session not found');
    if (session.isArchived)
        throw new BadRequestError('Cannot send messages to archived session');

    const userCrisisLevel = AIService.detectCrisisLevel(content);
    const detectedEmotion = AIService.detectEmotion(content);

    const userMessage = await ChatMessageRepo.create({
        sessionId,
        role: MessageRole.USER,
        content,
        crisisLevel: userCrisisLevel,
    });

    const messageCount = await ChatMessageRepo.countBySessionId(sessionId);
    if (messageCount === 1) {
        await trackAnalyticsEvent(userId, 'chat_started', { sessionId });
    }

    const userMessageCount =
        await ChatMessageRepo.countUserMessagesBySessionId(sessionId);
    if (userMessageCount >= 3 && !session.isComplete) {
        await prisma.$transaction([
            prisma.chatSession.update({
                where: { id: sessionId },
                data: { isComplete: true },
            }),
            prisma.user.update({
                where: { id: userId },
                data: { freeSessionsCompleted: { increment: 1 } },
            }),
        ]);
    }

    let fullReply = '';
    let metadata: Record<string, unknown> = {};

    try {
        for await (const evt of AIService.callSouliChatStreamAPI(
            content,
            sessionId,
        )) {
            if (evt.event === 'chunk') {
                fullReply += (evt.data as { text: string }).text;
                yield { event: 'chunk', data: evt.data };
            } else if (evt.event === 'metadata') {
                metadata = evt.data;
                yield { event: 'metadata', data: evt.data };
            } else if (evt.event === 'error') {
                yield { event: 'error', data: evt.data };
                return;
            }
        }
    } catch (error) {
        logger.error('AI stream failed, falling back', { sessionId, error });
        yield {
            event: 'error',
            data: { message: 'AI stream service unavailable' },
        };
        return;
    }

    const assistantMessage = await ChatMessageRepo.create({
        sessionId,
        role: MessageRole.ASSISTANT,
        content: fullReply,
        crisisLevel: userCrisisLevel,
        detectedEmotion,
        phase: (metadata.phase as string) ?? undefined,
        energyNode: (metadata.energy_node as string) ?? undefined,
        secondaryNode: (metadata.secondary_node as string) ?? undefined,
        nodeReasoning: (metadata.node_reasoning as string) ?? undefined,
        turnCount: (metadata.turn_count as number) ?? undefined,
        solutionStep: (metadata.solution_step as number) ?? undefined,
    });

    try {
        await ChatSessionRepo.applyAssistantMessageMetadata(sessionId, {
            phase: (metadata.phase as string) ?? undefined,
            energyNode: (metadata.energy_node as string) ?? undefined,
            secondaryNode: (metadata.secondary_node as string) ?? undefined,
            solutionStep: (metadata.solution_step as number) ?? undefined,
        });
    } catch (error) {
        logger.error('Failed to mirror stream metadata onto session', {
            sessionId,
            error,
        });
    }

    if (
        userCrisisLevel === CrisisLevel.HIGH ||
        userCrisisLevel === CrisisLevel.MEDIUM
    ) {
        await handleCrisisEvent(
            userId,
            sessionId,
            userMessage.id,
            userCrisisLevel,
        );
    }

    if (detectedEmotion) {
        await storeEmotionalState(userId, sessionId, detectedEmotion);
    }

    if (session.title === 'New Chat' && messageCount <= 2) {
        const newTitle = await generateSessionTitle(content);
        if (newTitle) {
            await ChatSessionRepo.update(sessionId, { title: newTitle });
        }
    }

    const updatedSession =
        (await ChatSessionRepo.findById(sessionId)) ?? session;

    yield {
        event: 'done',
        data: {
            userMessage: toMessageDto(userMessage, updatedSession),
            aiMessage: toMessageDto(assistantMessage, updatedSession),
            session: toSessionDto(updatedSession),
            freeTier: await buildFreeTierStatus(userId, updatedSession),
        },
    };
}

export default {
    createSession,
    getSessions,
    getSession,
    updateSession,
    archiveSession,
    deleteSession,
    sendMessage,
    sendMessageStream,
    saveVoiceTranscript,
    getMessages,
    getSessionAiState,
    getFreeTierStatus,
    acknowledgeCouponPopup,
};
