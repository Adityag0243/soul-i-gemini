import { ChatMessage, MessageRole, CrisisLevel } from '@prisma/client';
import { prisma } from '../../../database';

export interface CreateChatMessageData {
    sessionId: string;
    role: MessageRole;
    content: string;
    tokenCount?: number;
    crisisLevel?: CrisisLevel;
}

/**
 * Create a new chat message
 */
async function create(data: CreateChatMessageData): Promise<ChatMessage> {
    return prisma.chatMessage.create({
        data: {
            sessionId: data.sessionId,
            role: data.role,
            content: data.content,
            tokenCount: data.tokenCount ?? null,
            crisisLevel: data.crisisLevel ?? CrisisLevel.NONE,
        },
    });
}

/**
 * Create multiple messages at once (for batch operations)
 */
async function createMany(
    messages: CreateChatMessageData[],
): Promise<{ count: number }> {
    return prisma.chatMessage.createMany({
        data: messages.map((msg) => ({
            sessionId: msg.sessionId,
            role: msg.role,
            content: msg.content,
            tokenCount: msg.tokenCount ?? null,
            crisisLevel: msg.crisisLevel ?? CrisisLevel.NONE,
        })),
    });
}

/**
 * Find message by ID
 */
async function findById(id: string): Promise<ChatMessage | null> {
    return prisma.chatMessage.findUnique({
        where: { id },
    });
}

/**
 * Find messages by session ID
 */
async function findBySessionId(
    sessionId: string,
    options?: {
        limit?: number;
        offset?: number;
        order?: 'asc' | 'desc';
    },
): Promise<ChatMessage[]> {
    return prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: options?.order ?? 'asc' },
        take: options?.limit,
        skip: options?.offset,
    });
}

/**
 * Get recent messages for context (for AI)
 */
async function getRecentMessages(
    sessionId: string,
    limit: number = 20,
): Promise<ChatMessage[]> {
    const messages = await prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'desc' },
        take: limit,
    });

    // Return in chronological order
    return messages.reverse();
}

/**
 * Count messages in a session
 */
async function countBySessionId(sessionId: string): Promise<number> {
    return prisma.chatMessage.count({
        where: { sessionId },
    });
}

/**
 * Delete all messages in a session
 */
async function deleteBySessionId(
    sessionId: string,
): Promise<{ count: number }> {
    return prisma.chatMessage.deleteMany({
        where: { sessionId },
    });
}

/**
 * Update crisis level for a message
 */
async function updateCrisisLevel(
    id: string,
    crisisLevel: CrisisLevel,
): Promise<ChatMessage> {
    return prisma.chatMessage.update({
        where: { id },
        data: { crisisLevel },
    });
}

/**
 * Find messages with crisis detected
 */
async function findCrisisMessages(
    sessionId: string,
    minLevel?: CrisisLevel,
): Promise<ChatMessage[]> {
    const levels: CrisisLevel[] = [];

    switch (minLevel) {
        case CrisisLevel.LOW:
            levels.push(CrisisLevel.LOW, CrisisLevel.MEDIUM, CrisisLevel.HIGH);
            break;
        case CrisisLevel.MEDIUM:
            levels.push(CrisisLevel.MEDIUM, CrisisLevel.HIGH);
            break;
        case CrisisLevel.HIGH:
            levels.push(CrisisLevel.HIGH);
            break;
        default:
            levels.push(CrisisLevel.LOW, CrisisLevel.MEDIUM, CrisisLevel.HIGH);
    }

    return prisma.chatMessage.findMany({
        where: {
            sessionId,
            crisisLevel: { in: levels },
        },
        orderBy: { createdAt: 'asc' },
    });
}

/**
 * Get total token count for a session
 */
async function getTotalTokenCount(sessionId: string): Promise<number> {
    const result = await prisma.chatMessage.aggregate({
        where: { sessionId },
        _sum: { tokenCount: true },
    });

    return result._sum.tokenCount ?? 0;
}

export default {
    create,
    createMany,
    findById,
    findBySessionId,
    getRecentMessages,
    countBySessionId,
    deleteBySessionId,
    updateCrisisLevel,
    findCrisisMessages,
    getTotalTokenCount,
};
