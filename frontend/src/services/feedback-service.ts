import { Feedback, FeedbackStats } from "@/types/feedback";

const MOCK_FEEDBACKS: Feedback[] = [
  {
    id: "1",
    userName: "Sarah Johnson",
    userEmail: "sarah@example.com",
    type: "worse",
    message: "This made me more anxious instead of relaxed. The pace was too fast.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "2",
    userName: "Sarah Johnson",
    userEmail: "sarah@example.com",
    type: "better",
    message: "This made me more anxious instead of relaxed. The pace was too fast.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "3",
    userName: "Sarah Johnson",
    userEmail: "sarah@example.com",
    type: "same",
    message: "This made me more anxious instead of relaxed. The pace was too fast.",
    createdAt: new Date().toISOString(),
  },
];

export const feedbackService = {
  async getFeedbacks(): Promise<Feedback[]> {
    await new Promise((resolve) => setTimeout(resolve, 800));
    return [...MOCK_FEEDBACKS];
  },

  async getStats(): Promise<FeedbackStats> {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return {
      worse: MOCK_FEEDBACKS.filter((f) => f.type === "worse").length,
      better: MOCK_FEEDBACKS.filter((f) => f.type === "better").length,
      same: MOCK_FEEDBACKS.filter((f) => f.type === "same").length,
    };
  },
};

