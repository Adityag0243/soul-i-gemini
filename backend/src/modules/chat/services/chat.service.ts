import {
    MessageRole,
    CrisisLevel,
    ChatSession,
    ChatMessage,
    Prisma,
} from '@prisma/client';
import { prisma } from '../../../database';
import { BadRequestError, NotFoundError } from '../../../core/api-error';
import logger from '../../../core/logger';
import ChatSessionRepo from '../repositories/chat-session.repo';
import ChatMessageRepo from '../repositories/chat-message.repo';
import AIService from './ai.service';
import {
    ChatSessionDto,
    ChatMessageDto,
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

function toMessageDto(message: ChatMessage): ChatMessageDto {
    return {
        id: message.id,
        sessionId: message.sessionId,
        role: message.role,
        content: message.content,
        tokenCount: message.tokenCount,
        crisisLevel: message.crisisLevel,
        createdAt: message.createdAt,
    };
}

//session opration

// create a new chat session
export async function createSession(
    userId: number,
    input: CreateSessionInput,
): Promise<ChatSessionDto> {
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

    // generate AI response
    const aiResponse = await AIService.generateResponse(
        conversationHistory,
        content,
    );

    // save assistant message
    const assistantMessage = await ChatMessageRepo.create({
        sessionId,
        role: MessageRole.ASSISTANT,
        content: aiResponse.content,
        tokenCount: aiResponse.tokenCount,
        crisisLevel: aiResponse.crisisLevel,
    });

    logger.info('Assistant message saved', {
        sessionId,
        messageId: assistantMessage.id,
        crisisLevel: aiResponse.crisisLevel,
    });

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

    return {
        userMessage: toMessageDto(userMessage),
        assistantMessage: toMessageDto(assistantMessage),
        detectedEmotion: aiResponse.detectedEmotion,
        crisisLevel: aiResponse.crisisLevel,
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
        userMessage: toMessageDto(userMessage),
        assistantMessage: assistantMessage
            ? toMessageDto(assistantMessage)
            : null,
        detectedEmotion: input.detectedEmotion,
        crisisLevel: userCrisisLevel,
    };
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
        messages: messages.map(toMessageDto),
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

export default {
    createSession,
    getSessions,
    getSession,
    updateSession,
    archiveSession,
    deleteSession,
    sendMessage,
    saveVoiceTranscript,
    getMessages,
};
