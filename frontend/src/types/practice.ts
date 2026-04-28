export type MediaType = "AUDIO" | "VIDEO";

export interface Practice {
  id: string;
  title: string;
  description: string;
  durationMinutes: number;
  durationLabel: string;
  practiceType: string;
  mediaType: MediaType;
  mediaUrl: string;
  mediaKey: string;
  mediaBucket: string;
  mediaOriginalName: string;
  mediaMimeType: string;
  mediaSizeBytes: number;
  tags: string[];
  status: string;
  isActive: boolean;
  suggestToAi: boolean;
  sourceSheetName: string | null;
  createdByAdminId: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PracticeSummary {
  totalPractices: number;
  audioContent: number;
  videoContent: number;
}

export interface PracticeListResponse {
  message: string;
  success: boolean;
  data: {
    summary: PracticeSummary;
    practices: Practice[];
  };
}

export interface CreatePracticeInput {
  title: string;
  description: string;
  duration: string; // Changed back to string to match "10 min" format in docs
  practiceType: string;
  mediaType: MediaType;
  tags: string; // Changed to string for comma-separated submission
  media: File;
}
