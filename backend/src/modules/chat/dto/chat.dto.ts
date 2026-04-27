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
    createdAt: Date;
    tokenCount: number | null;
    crisisLevel: CrisisLevel;

    // AI metadata (stored on assistant message rows; null on user rows)
    detectedEmotion: string | null;
    phase: string | null;
    energyNode: string | null;
    secondaryNode: string | null;
    nodeReasoning: string | null;
    turnCount: number | null;
    solutionStep: number | null;
    ragSources: unknown;

    // Session-level signals copied onto the message DTO for mobile convenience (D5).
    // Reflect "current session state at the time this DTO was built" — not
    // historically accurate per-message.
    isSolutionComplete: boolean;
    threeDayTask: unknown;

    // Voice metadata
    audioUrl: string | null;
    durationMs: number | null;
}

export interface FreeTierStatusDto {
    used: number;
    total: number;
    isComplete: boolean;
    showCouponPopup: boolean;
}

export interface SendMessageResponseDto {
    userMessage: ChatMessageDto;
    aiMessage: ChatMessageDto;
    session: ChatSessionDto;
    crisisResources: unknown | null;
    freeTier: FreeTierStatusDto;
}

export interface SaveVoiceTranscriptResponseDto {
    userMessage: ChatMessageDto;
    aiMessage: ChatMessageDto | null;
    session: ChatSessionDto;
}

export interface ChatSessionWithMessagesDto extends ChatSessionDto {
    messages: ChatMessageDto[];
}

export interface CreateSessionResponseDto {
    session: ChatSessionDto;
    greetingMessage: ChatMessageDto | null;
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

// Free session tracking DTOs
export interface FreeSessionStatusDto {
    freeSessionsCompleted: number;
    freeSessionsRemaining: number;
    canCreateNewSession: boolean;
    hasActiveSubscription: boolean;
    shouldShowCouponPopup: boolean;
    couponPopupAlreadyShown: boolean;
}

export interface SessionCompletionDto {
    sessionId: string;
    isComplete: boolean;
    phase?: string;
    turnCount: number;
    freeSessionsCompleted: number;
    shouldShowCouponPopup: boolean;
}

export interface CouponPopupStatusDto {
    popupShown: boolean;
    message: string;
}
