import { PracticeMediaType, PracticeStatus } from '@prisma/client';

export interface PracticeSummaryDto {
    totalPractices: number;
    audioContent: number;
    videoContent: number;
}

export interface PracticeTaskDto {
    id: string;
    title: string;
    description: string;
    durationMinutes: number;
    durationLabel: string;
    practiceType: string;
    mediaType: PracticeMediaType;
    mediaUrl: string | null;
    mediaKey: string | null;
    mediaBucket: string | null;
    mediaOriginalName: string | null;
    mediaMimeType: string | null;
    mediaSizeBytes: number | null;
    tags: string[];
    status: PracticeStatus;
    isActive: boolean;
    suggestToAi: boolean;
    sourceSheetName: string | null;
    createdByAdminId: number | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface PracticeListResponseDto {
    summary: PracticeSummaryDto;
    practices: PracticeTaskDto[];
}

export interface BulkPracticeImportResultDto {
    summary: PracticeSummaryDto;
    createdCount: number;
    practices: PracticeTaskDto[];
}
