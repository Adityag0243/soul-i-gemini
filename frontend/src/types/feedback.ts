export type FeedbackType = "worse" | "better" | "same";

export interface Feedback {
  id: string;
  userName: string;
  userEmail: string;
  type: FeedbackType;
  message: string;
  createdAt: string;
}

export interface FeedbackStats {
  worse: number;
  better: number;
  same: number;
}

