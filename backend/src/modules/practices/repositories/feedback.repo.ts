import { FeedbackType } from '@prisma/client';
import { prisma } from '../../../database';

export async function createFeedback(data: {
    userId: number;
    practiceId: string;
    feedback: FeedbackType;
    reflection?: string;
}) {
    return prisma.practiceFeedback.create({ data });
}

export async function findByUserAndPractice(userId: number, practiceId: string) {
    return prisma.practiceFeedback.findMany({
        where: { userId, practiceId },
        orderBy: { createdAt: 'desc' },
    });
}
