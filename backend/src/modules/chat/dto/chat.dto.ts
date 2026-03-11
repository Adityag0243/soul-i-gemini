import { MessageRole, CrisisLevel } from '@prisma/client';

export interface ChatSessionDto {
    id: string;
    userId: number;
    title: string | null;
    isArchived: boolean;
    startedAt: Date;
    endedAt: Date | null;
    createdAt: Date;
    messageCount?: number;
}

export interface ChatMessageDto {
    id: string;
    sessionId: string;
    role: MessageRole;
    content: string;
    tokenCount: number | null;
    crisisLevel: CrisisLevel;
    createdAt: Date;
}

export interface SendMessageResponseDto {
    userMessage: ChatMessageDto;
    assistantMessage: ChatMessageDto;
    detectedEmotion?: string;
    crisisLevel: CrisisLevel;
}

export interface ChatSessionWithMessagesDto extends ChatSessionDto {
    messages: ChatMessageDto[];
}

export interface SessionListResponseDto {
    sessions: ChatSessionDto[];
    total: number;
}

export interface MessageListResponseDto {
    messages: ChatMessageDto[];
    total: number;
    sessionId: string;
}
