import { ChatSession, ChatMessage, Prisma } from '@prisma/client';
import { prisma } from '../../../database';

export interface CreateChatSessionData {
    userId: number;
    title?: string;
}

export interface UpdateChatSessionData {
    title?: string;
    isArchived?: boolean;
    endedAt?: Date;
}

export interface ChatSessionWithMessageCount extends ChatSession {
    _count?: {
        messages: number;
    };
}

/**
 * Create a new chat session
 */
async function create(data: CreateChatSessionData): Promise<ChatSession> {
    return prisma.chatSession.create({
        data: {
            userId: data.userId,
            title: data.title ?? 'New Chat',
            isArchived: false,
            startedAt: new Date(),
        },
    });
}

/**
 * Find chat session by ID
 */
async function findById(id: string): Promise<ChatSession | null> {
    return prisma.chatSession.findUnique({
        where: { id },
    });
}

/**
 * Find chat session by ID with ownership verification
 */
async function findByIdAndUserId(
    id: string,
    userId: number,
): Promise<ChatSession | null> {
    return prisma.chatSession.findFirst({
        where: {
            id,
            userId,
        },
    });
}

/**
 * Find all chat sessions for a user (non-archived)
 */
async function findByUserId(
    userId: number,
    options?: {
        includeArchived?: boolean;
        limit?: number;
        offset?: number;
    },
): Promise<ChatSessionWithMessageCount[]> {
    const where: Prisma.ChatSessionWhereInput = {
        userId,
    };

    if (!options?.includeArchived) {
        where.isArchived = false;
    }

    return prisma.chatSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 50,
        skip: options?.offset ?? 0,
        include: {
            _count: {
                select: { messages: true },
            },
        },
    });
}

/**
 * Update chat session
 */
async function update(
    id: string,
    data: UpdateChatSessionData,
): Promise<ChatSession> {
    return prisma.chatSession.update({
        where: { id },
        data,
    });
}

/**
 * Archive chat session
 */
async function archive(id: string): Promise<ChatSession> {
    return prisma.chatSession.update({
        where: { id },
        data: {
            isArchived: true,
            endedAt: new Date(),
        },
    });
}

/**
 * Delete chat session (hard delete)
 */
async function remove(id: string): Promise<void> {
    await prisma.chatSession.delete({
        where: { id },
    });
}

/**
 * Count active sessions for a user
 */
async function countActiveSessions(userId: number): Promise<number> {
    return prisma.chatSession.count({
        where: {
            userId,
            isArchived: false,
        },
    });
}

/**
 * Get session with messages
 */
async function findWithMessages(
    id: string,
    userId: number,
    messageLimit?: number,
): Promise<(ChatSession & { messages: ChatMessage[] }) | null> {
    return prisma.chatSession.findFirst({
        where: {
            id,
            userId,
        },
        include: {
            messages: {
                orderBy: { createdAt: 'asc' },
                take: messageLimit,
            },
        },
    });
}

export default {
    create,
    findById,
    findByIdAndUserId,
    findByUserId,
    update,
    archive,
    remove,
    countActiveSessions,
    findWithMessages,
};
