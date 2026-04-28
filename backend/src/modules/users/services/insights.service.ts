import { Prisma } from '@prisma/client';
import { prisma } from '../../../database';

export async function getInsights(userId: number, range: string) {
    const now = new Date();
    let from: Date | null = null;

    if (range !== 'all') {
        const days = parseInt(range, 10);
        from = new Date(now);
        from.setUTCDate(from.getUTCDate() - days);
        from.setUTCHours(0, 0, 0, 0);
    }

    const dateFilter = from ? { gte: from } : undefined;

    const [
        totalSessions,
        totalMessages,
        voiceMessages,
        checkins,
        crisisEvents,
        practicesCompleted,
        practiceFeedbacks,
        energyNodes,
        moodScores,
    ] = await Promise.all([
        prisma.chatSession.count({
            where: { userId, ...(dateFilter && { createdAt: dateFilter }) },
        }),

        prisma.chatMessage.count({
            where: {
                session: { userId },
                ...(dateFilter && { createdAt: dateFilter }),
            },
        }),

        prisma.chatMessage.aggregate({
            where: {
                session: { userId },
                durationMs: { not: null },
                ...(dateFilter && { createdAt: dateFilter }),
            },
            _sum: { durationMs: true },
            _count: true,
        }),

        prisma.dailyCheckin.findMany({
            where: { userId, ...(dateFilter && { createdAt: dateFilter }) },
            select: { date: true, moodScore: true },
            orderBy: { date: 'asc' },
        }),

        prisma.crisisEvent.count({
            where: { userId, ...(dateFilter && { createdAt: dateFilter }) },
        }),

        prisma.practiceAssignment.count({
            where: {
                userId,
                completedAt: { not: null },
                ...(dateFilter && { assignedAt: dateFilter }),
            },
        }),

        prisma.practiceFeedback.count({
            where: { userId, ...(dateFilter && { createdAt: dateFilter }) },
        }),

        prisma.emotionalState.groupBy({
            by: ['energyNodeId'],
            where: {
                userId,
                energyNodeId: { not: null },
                ...(dateFilter && { createdAt: dateFilter }),
            },
            _count: true,
            orderBy: { _count: { energyNodeId: 'desc' } },
        }),

        prisma.dailyCheckin.findMany({
            where: { userId, ...(dateFilter && { createdAt: dateFilter }) },
            select: { date: true, moodScore: true },
            orderBy: { date: 'asc' },
        }),
    ]);

    const energyNodeIds = energyNodes
        .map((e) => e.energyNodeId)
        .filter((id): id is string => id !== null);

    const nodeDetails = energyNodeIds.length > 0
        ? await prisma.energyNode.findMany({
              where: { id: { in: energyNodeIds } },
              select: { id: true, slug: true, title: true, color: true },
          })
        : [];

    const nodeMap = new Map(nodeDetails.map((n) => [n.id, n]));

    const energyNodeFrequency = energyNodes.map((e) => {
        const node = e.energyNodeId ? nodeMap.get(e.energyNodeId) : null;
        return {
            energyNodeId: e.energyNodeId,
            slug: node?.slug ?? null,
            title: node?.title ?? null,
            color: node?.color ?? null,
            count: e._count,
        };
    });

    // Streak calculation from checkin dates
    let currentStreak = 0;
    if (checkins.length > 0) {
        const dateSet = new Set(
            checkins.map((c) => c.date.toISOString().slice(0, 10)),
        );
        const todayStr = now.toISOString().slice(0, 10);
        const cursor = new Date(todayStr + 'T00:00:00.000Z');
        if (!dateSet.has(todayStr)) {
            cursor.setUTCDate(cursor.getUTCDate() - 1);
        }
        while (dateSet.has(cursor.toISOString().slice(0, 10))) {
            currentStreak++;
            cursor.setUTCDate(cursor.getUTCDate() - 1);
        }
    }

    // Mood trend: array of { date, score }
    const moodTrend = moodScores.map((m) => ({
        date: m.date.toISOString().slice(0, 10),
        score: m.moodScore,
    }));

    // Top themes from chat sessions
    const sessions = await prisma.chatSession.findMany({
        where: {
            userId,
            energyNode: { not: null },
            ...(dateFilter && { createdAt: dateFilter }),
        },
        select: { energyNode: true },
    });

    const themeCounts: Record<string, number> = {};
    for (const s of sessions) {
        if (s.energyNode) {
            themeCounts[s.energyNode] = (themeCounts[s.energyNode] || 0) + 1;
        }
    }
    const topThemes = Object.entries(themeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([theme, count]) => ({ theme, count }));

    return {
        range,
        from: from?.toISOString() ?? null,
        to: now.toISOString(),
        totalSessions,
        totalMessages,
        totalVoiceMessages: voiceMessages._count,
        totalVoiceMinutes: Math.round(
            (voiceMessages._sum.durationMs ?? 0) / 60000,
        ),
        checkInStreak: currentStreak,
        checkInsCount: checkins.length,
        moodTrend,
        energyNodeFrequency,
        crisisEvents,
        practicesCompleted,
        practiceFeedbacks,
        topThemes,
    };
}
