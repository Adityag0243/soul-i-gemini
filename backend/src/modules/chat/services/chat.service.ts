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
    SessionListResponseDto,
    MessageListResponseDto,
} from '../dto/chat.dto';
import {
    CreateSessionInput,
    UpdateSessionInput,
    SendMessageInput,
} from '../schemas/chat.schema';

// ============================================================
// HELPER FUNCTIONS
// ============================================================

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

// ============================================================
// SESSION OPERATIONS
// ============================================================

/**
 * Create a new chat session
 */
export async function createSession(
    userId: number,
    input: CreateSessionInput,
): Promise<ChatSessionDto> {
    const session = await ChatSessionRepo.create({
        userId,
        title: input.title,
    });

    logger.info('Chat session created', { sessionId: session.id, userId });

    // Track analytics event
    await trackAnalyticsEvent(userId, 'session_created', {
        sessionId: session.id,
    });

    return toSessionDto(session);
}

/**
 * Get all chat sessions for a user
 */
export async function getSessions(
    userId: number,
    options?: {
        includeArchived?: boolean;
        limit?: number;
        offset?: number;
    },
): Promise<SessionListResponseDto> {
    const sessions = await ChatSessionRepo.findByUserId(userId, options);

    // Get total count for pagination
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

/**
 * Get a single chat session
 */
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

/**
 * Update chat session (rename, archive)
 */
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

/**
 * Archive a chat session
 */
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

/**
 * Delete a chat session (hard delete)
 */
export async function deleteSession(
    sessionId: string,
    userId: number,
): Promise<void> {
    // Verify ownership
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

// ============================================================
// MESSAGE OPERATIONS
// ============================================================

/**
 * Send a message and get AI response
 */
export async function sendMessage(
    userId: number,
    input: SendMessageInput,
): Promise<SendMessageResponseDto> {
    const { sessionId, content } = input;

    // Verify session ownership
    const session = await ChatSessionRepo.findByIdAndUserId(sessionId, userId);
    if (!session) {
        throw new NotFoundError('Chat session not found');
    }

    if (session.isArchived) {
        throw new BadRequestError('Cannot send messages to archived session');
    }

    // Get recent conversation history for context
    const conversationHistory = await ChatMessageRepo.getRecentMessages(
        sessionId,
        20,
    );

    // Save user message first
    const userMessage = await ChatMessageRepo.create({
        sessionId,
        role: MessageRole.USER,
        content,
        crisisLevel: AIService.detectCrisisLevel(content),
    });

    logger.info('User message saved', { sessionId, messageId: userMessage.id });

    // Track chat started event if this is the first message
    const messageCount = await ChatMessageRepo.countBySessionId(sessionId);
    if (messageCount === 1) {
        await trackAnalyticsEvent(userId, 'chat_started', { sessionId });
    }

    // Generate AI response
    const aiResponse = await AIService.generateResponse(
        conversationHistory,
        content,
    );

    // Save assistant message
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

    // Store emotional state if detected
    if (aiResponse.detectedEmotion) {
        await storeEmotionalState(
            userId,
            sessionId,
            aiResponse.detectedEmotion,
        );
    }

    // Auto-update session title if it's the default and this is the first exchange
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

/**
 * Get messages for a session
 */
export async function getMessages(
    sessionId: string,
    userId: number,
    options?: {
        limit?: number;
        offset?: number;
    },
): Promise<MessageListResponseDto> {
    // Verify session ownership
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

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Handle crisis event detection
 */
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

        // Track analytics
        await trackAnalyticsEvent(userId, 'crisis_detected', {
            sessionId,
            level,
            triggerMessageId,
        });
    } catch (error) {
        logger.error('Failed to record crisis event:', error);
    }
}

/**
 * Store detected emotional state
 */
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

/**
 * Generate a short title from the first message
 */
async function generateSessionTitle(
    firstMessage: string,
): Promise<string | null> {
    // Simple title generation - take first 50 chars
    const title = firstMessage.trim().slice(0, 50);
    if (title.length < firstMessage.length) {
        return title + '...';
    }
    return title || null;
}

/**
 * Track analytics event
 */
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
    getMessages,
};
