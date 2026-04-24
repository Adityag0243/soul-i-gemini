import {
    FeedbackType,
    MessageRole,
    PracticeStatus,
    RoleCode,
} from '@prisma/client';
import { prisma } from '../../../../database';
import { AuthFailureError } from '../../../../core/api-error';
import { AuthUser } from '../../../../types/user';
import { DashboardOverviewDto, DashboardStat } from '../dto/dashboard.dto';

type MetricPeriod = {
    start: Date;
    end: Date;
};

const DISTRIBUTION_COLORS = [
    '#8E7CE0',
    '#0F988D',
    '#F40009',
    '#19A764',
    '#1E7EC8',
    '#F59E0B',
];

function ensureAdminUser(user: AuthUser): void {
    const isAdmin = user.roles.some((role) => role.code === RoleCode.ADMIN);
    if (!isAdmin) {
        throw new AuthFailureError('Admin access required');
    }
}

function toPercent(value: number): number {
    return Number(value.toFixed(1));
}

function computeTrend(current: number, previous: number): number {
    if (previous === 0) {
        if (current === 0) {
            return 0;
        }
        return 100;
    }

    return toPercent(((current - previous) / Math.abs(previous)) * 100);
}

function formatMinutes(minutes: number): string {
    return `${minutes.toFixed(1)}m`;
}

function formatSeconds(seconds: number): string {
    return `${seconds.toFixed(1)}s`;
}

function getDayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function getRecentDays(days: number): { label: string; key: string }[] {
    const result: { label: string; key: string }[] = [];
    const now = new Date();

    for (let index = days - 1; index >= 0; index -= 1) {
        const date = new Date(now);
        date.setHours(0, 0, 0, 0);
        date.setDate(now.getDate() - index);

        result.push({
            label: date.toLocaleDateString('en-US', { weekday: 'short' }),
            key: getDayKey(date),
        });
    }

    return result;
}

function getPeriod(days: number, offsetDays = 0): MetricPeriod {
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    end.setDate(end.getDate() - offsetDays);

    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));

    return { start, end };
}

function toDashboardStat(
    value: string | number,
    trend: number,
    trendLabel = 'from last week',
): DashboardStat {
    return {
        value,
        trend,
        trendLabel,
    };
}

function getDurationLabel(startedAt: Date): string {
    const diffSeconds = Math.max(
        0,
        Math.floor((Date.now() - startedAt.getTime()) / 1000),
    );

    const minutes = Math.floor(diffSeconds / 60)
        .toString()
        .padStart(1, '0');
    const seconds = Math.floor(diffSeconds % 60)
        .toString()
        .padStart(2, '0');

    return `${minutes}:${seconds}`;
}

function getEventType(
    eventName: string,
): 'info' | 'success' | 'warning' | 'error' {
    const normalized = eventName.toLowerCase();

    if (normalized.includes('error') || normalized.includes('fail')) {
        return 'error';
    }

    if (normalized.includes('warning') || normalized.includes('dropoff')) {
        return 'warning';
    }

    if (
        normalized.includes('complete') ||
        normalized.includes('success') ||
        normalized.includes('resolved')
    ) {
        return 'success';
    }

    return 'info';
}

function extractNumericMetadataValue(
    value: unknown,
    keys: string[],
): number | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const metadata = value as Record<string, unknown>;
    for (const key of keys) {
        const entry = metadata[key];
        if (typeof entry === 'number' && Number.isFinite(entry)) {
            return entry;
        }

        if (typeof entry === 'string') {
            const parsed = Number(entry);
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }
    }

    return null;
}

function extractStringMetadataValue(
    value: unknown,
    key: string,
): string | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const metadata = value as Record<string, unknown>;
    const entry = metadata[key];
    if (typeof entry !== 'string') {
        return null;
    }

    const trimmed = entry.trim();
    return trimmed ? trimmed : null;
}

async function getDashboardOverview(
    adminUser: AuthUser,
): Promise<DashboardOverviewDto> {
    ensureAdminUser(adminUser);

    const fallbackModules: string[] = [];
    const notes: string[] = [];

    const sevenDays = getPeriod(7, 0);
    const previousSevenDays = getPeriod(7, 7);
    const dayBuckets = getRecentDays(7);

    const [
        totalUsers,
        activeSessions,
        totalSessions,
        completedSessions,
        currentUsers,
        previousUsers,
        currentStartedSessions,
        previousStartedSessions,
        currentCompletedSessions,
        previousCompletedSessions,
        completedSessionDurations,
        currentWeekSessionDurations,
        previousWeekSessionDurations,
        usersForActivity,
        sessionsForActivity,
        practiceDistributionRows,
        feedbackRows,
        analyticsEvents,
        totalConversations,
        currentConversations,
        previousConversations,
        activeLiveSessions,
    ] = await Promise.all([
        prisma.user.count({ where: { status: true } }),
        prisma.chatSession.count({
            where: {
                isArchived: false,
                endedAt: null,
            },
        }),
        prisma.chatSession.count(),
        prisma.chatSession.count({
            where: {
                endedAt: { not: null },
            },
        }),
        prisma.user.count({
            where: {
                createdAt: {
                    gte: sevenDays.start,
                    lte: sevenDays.end,
                },
            },
        }),
        prisma.user.count({
            where: {
                createdAt: {
                    gte: previousSevenDays.start,
                    lte: previousSevenDays.end,
                },
            },
        }),
        prisma.chatSession.count({
            where: {
                startedAt: {
                    gte: sevenDays.start,
                    lte: sevenDays.end,
                },
            },
        }),
        prisma.chatSession.count({
            where: {
                startedAt: {
                    gte: previousSevenDays.start,
                    lte: previousSevenDays.end,
                },
            },
        }),
        prisma.chatSession.count({
            where: {
                startedAt: {
                    gte: sevenDays.start,
                    lte: sevenDays.end,
                },
                endedAt: {
                    not: null,
                },
            },
        }),
        prisma.chatSession.count({
            where: {
                startedAt: {
                    gte: previousSevenDays.start,
                    lte: previousSevenDays.end,
                },
                endedAt: {
                    not: null,
                },
            },
        }),
        prisma.chatSession.findMany({
            where: {
                endedAt: { not: null },
            },
            select: {
                startedAt: true,
                endedAt: true,
            },
            take: 300,
            orderBy: {
                startedAt: 'desc',
            },
        }),
        prisma.chatSession.findMany({
            where: {
                endedAt: { not: null },
                startedAt: {
                    gte: sevenDays.start,
                    lte: sevenDays.end,
                },
            },
            select: {
                startedAt: true,
                endedAt: true,
            },
            take: 200,
        }),
        prisma.chatSession.findMany({
            where: {
                endedAt: { not: null },
                startedAt: {
                    gte: previousSevenDays.start,
                    lte: previousSevenDays.end,
                },
            },
            select: {
                startedAt: true,
                endedAt: true,
            },
            take: 200,
        }),
        prisma.user.findMany({
            where: {
                createdAt: {
                    gte: dayBuckets[0]
                        ? new Date(dayBuckets[0].key)
                        : sevenDays.start,
                },
            },
            select: {
                createdAt: true,
            },
        }),
        prisma.chatSession.findMany({
            where: {
                startedAt: {
                    gte: dayBuckets[0]
                        ? new Date(dayBuckets[0].key)
                        : sevenDays.start,
                },
            },
            select: {
                startedAt: true,
            },
        }),
        prisma.practiceTask.groupBy({
            by: ['practiceType'],
            where: {
                isActive: true,
                status: PracticeStatus.ACTIVE,
            },
            _count: {
                _all: true,
            },
        }),
        prisma.practiceFeedback.findMany({
            include: {
                practice: {
                    select: {
                        title: true,
                    },
                },
            },
            take: 500,
            orderBy: {
                createdAt: 'desc',
            },
        }),
        prisma.analyticsEvent.findMany({
            include: {
                user: {
                    select: {
                        name: true,
                    },
                },
            },
            take: 400,
            orderBy: {
                createdAt: 'desc',
            },
        }),
        prisma.chatMessage.count({
            where: {
                role: MessageRole.USER,
            },
        }),
        prisma.chatMessage.count({
            where: {
                role: MessageRole.USER,
                createdAt: {
                    gte: sevenDays.start,
                    lte: sevenDays.end,
                },
            },
        }),
        prisma.chatMessage.count({
            where: {
                role: MessageRole.USER,
                createdAt: {
                    gte: previousSevenDays.start,
                    lte: previousSevenDays.end,
                },
            },
        }),
        prisma.chatSession.findMany({
            where: {
                isArchived: false,
                endedAt: null,
            },
            include: {
                user: {
                    select: {
                        name: true,
                    },
                },
            },
            orderBy: {
                startedAt: 'desc',
            },
            take: 8,
        }),
    ]);

    const completionRateValue =
        totalSessions > 0 ? (completedSessions / totalSessions) * 100 : 0;
    const currentCompletionRate =
        currentStartedSessions > 0
            ? (currentCompletedSessions / currentStartedSessions) * 100
            : 0;
    const previousCompletionRate =
        previousStartedSessions > 0
            ? (previousCompletedSessions / previousStartedSessions) * 100
            : 0;

    const averageDurationInMinutes = (
        items: { startedAt: Date; endedAt: Date | null }[],
    ): number => {
        const durations = items
            .filter((item): item is { startedAt: Date; endedAt: Date } =>
                Boolean(item.endedAt),
            )
            .map((item) =>
                Math.max(
                    0,
                    (item.endedAt.getTime() - item.startedAt.getTime()) / 60000,
                ),
            );

        if (durations.length === 0) {
            return 0;
        }

        const sum = durations.reduce((total, current) => total + current, 0);
        return sum / durations.length;
    };

    const avgSessionMinutes = averageDurationInMinutes(
        completedSessionDurations,
    );
    const avgCurrentWeekMinutes = averageDurationInMinutes(
        currentWeekSessionDurations,
    );
    const avgPreviousWeekMinutes = averageDurationInMinutes(
        previousWeekSessionDurations,
    );

    const usersByDay = new Map<string, number>();
    const sessionsByDay = new Map<string, number>();

    usersForActivity.forEach((item) => {
        const key = getDayKey(item.createdAt);
        usersByDay.set(key, (usersByDay.get(key) ?? 0) + 1);
    });

    sessionsForActivity.forEach((item) => {
        const key = getDayKey(item.startedAt);
        sessionsByDay.set(key, (sessionsByDay.get(key) ?? 0) + 1);
    });

    const userActivity = dayBuckets.map((day) => ({
        label: day.label,
        users: usersByDay.get(day.key) ?? 0,
        sessions: sessionsByDay.get(day.key) ?? 0,
    }));

    const totalPracticeCount = practiceDistributionRows.reduce(
        (sum, item) => sum + item._count._all,
        0,
    );

    const practiceDistribution =
        totalPracticeCount > 0
            ? practiceDistributionRows.map((item, index) => ({
                  name: item.practiceType,
                  value: toPercent(
                      (item._count._all / totalPracticeCount) * 100,
                  ),
                  color: DISTRIBUTION_COLORS[
                      index % DISTRIBUTION_COLORS.length
                  ],
              }))
            : [
                  { name: 'Meditation', value: 38, color: '#8E7CE0' },
                  { name: 'Breathing', value: 27, color: '#0F988D' },
                  { name: 'Sleep', value: 21, color: '#F40009' },
                  { name: 'Yoga', value: 15, color: '#19A764' },
              ];

    if (totalPracticeCount === 0) {
        fallbackModules.push('charts.practiceDistribution');
        notes.push(
            'No active practice distribution records found. Returned design fallback values.',
        );
    }

    const feedbackByPractice = new Map<
        string,
        {
            total: number;
            positive: number;
        }
    >();

    feedbackRows.forEach((feedback) => {
        const key = feedback.practice.title;
        const current = feedbackByPractice.get(key) ?? {
            total: 0,
            positive: 0,
        };

        current.total += 1;
        if (
            feedback.feedback === FeedbackType.BETTER ||
            feedback.feedback === FeedbackType.SAME
        ) {
            current.positive += 1;
        }

        feedbackByPractice.set(key, current);
    });

    const completionRates =
        feedbackByPractice.size > 0
            ? [...feedbackByPractice.entries()]
                  .map(([practice, stats]) => ({
                      practice,
                      rate: Math.round((stats.positive / stats.total) * 100),
                  }))
                  .sort((a, b) => b.rate - a.rate)
                  .slice(0, 6)
            : [
                  { practice: 'Morning Meditation', rate: 85 },
                  { practice: 'Breathing Exercise', rate: 92 },
                  { practice: 'Gentle Yoga', rate: 78 },
                  { practice: 'Deep Sleep', rate: 89 },
                  { practice: 'Quick Relax', rate: 95 },
              ];

    if (feedbackByPractice.size === 0) {
        fallbackModules.push('charts.completionRates');
        notes.push(
            'Practice completion currently inferred from feedback. Returned fallback bars because no feedback history exists.',
        );
    }

    const recentActivity = analyticsEvents.slice(0, 8).map((event) => ({
        id: event.id,
        userName: event.user?.name || 'Unknown user',
        action: event.eventName
            .split('_')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' '),
        timestamp: event.createdAt.toISOString(),
        type: getEventType(event.eventName),
    }));

    if (recentActivity.length === 0) {
        fallbackModules.push('recentActivity');
        notes.push(
            'No analytics events found. Returned empty recent activity list.',
        );
    }

    const responseTimeEvents = analyticsEvents
        .map((event) =>
            extractNumericMetadataValue(event.metadata, [
                'responseTimeMs',
                'latencyMs',
                'durationMs',
            ]),
        )
        .filter((value): value is number => value !== null);

    const avgResponseTimeSeconds =
        responseTimeEvents.length > 0
            ? responseTimeEvents.reduce((sum, value) => sum + value, 0) /
              responseTimeEvents.length /
              1000
            : 1.2;

    if (responseTimeEvents.length === 0) {
        fallbackModules.push('chatbot.stats.avgResponseTime');
        notes.push(
            'AI response latency telemetry is not yet tracked consistently. Returned fallback average response time.',
        );
    }

    const satisfactionValueByFeedback = {
        [FeedbackType.BETTER]: 5,
        [FeedbackType.SAME]: 3,
        [FeedbackType.WORSE]: 1,
    };

    const satisfactionScores = feedbackRows.map(
        (item) => satisfactionValueByFeedback[item.feedback],
    );

    const satisfactionCurrentScores = feedbackRows
        .filter(
            (item) =>
                item.createdAt >= sevenDays.start &&
                item.createdAt <= sevenDays.end,
        )
        .map((item) => satisfactionValueByFeedback[item.feedback]);

    const satisfactionPreviousScores = feedbackRows
        .filter(
            (item) =>
                item.createdAt >= previousSevenDays.start &&
                item.createdAt <= previousSevenDays.end,
        )
        .map((item) => satisfactionValueByFeedback[item.feedback]);

    const satisfactionAverage =
        satisfactionScores.length > 0
            ? satisfactionScores.reduce((sum, value) => sum + value, 0) /
              satisfactionScores.length
            : 4.7;

    const satisfactionCurrentAverage =
        satisfactionCurrentScores.length > 0
            ? satisfactionCurrentScores.reduce((sum, value) => sum + value, 0) /
              satisfactionCurrentScores.length
            : satisfactionAverage;

    const satisfactionPreviousAverage =
        satisfactionPreviousScores.length > 0
            ? satisfactionPreviousScores.reduce(
                  (sum, value) => sum + value,
                  0,
              ) / satisfactionPreviousScores.length
            : satisfactionAverage;

    if (satisfactionScores.length === 0) {
        fallbackModules.push('chatbot.stats.userSatisfaction');
        notes.push(
            'No user feedback scores found for satisfaction. Returned fallback score value.',
        );
    }

    const topicCounter = new Map<string, number>();
    analyticsEvents.forEach((event) => {
        const topic = extractStringMetadataValue(event.metadata, 'topic');
        if (!topic) {
            return;
        }

        topicCounter.set(topic, (topicCounter.get(topic) ?? 0) + 1);
    });

    const topicTotal = [...topicCounter.values()].reduce(
        (sum, count) => sum + count,
        0,
    );

    const topTopics =
        topicTotal > 0
            ? [...topicCounter.entries()]
                  .map(([topic, count]) => ({
                      topic,
                      count,
                      percentage: toPercent((count / topicTotal) * 100),
                  }))
                  .sort((a, b) => b.count - a.count)
                  .slice(0, 5)
            : [
                  { topic: 'Stress & Anxiety', count: 892, percentage: 35 },
                  { topic: 'Sleep Issues', count: 567, percentage: 22 },
                  { topic: 'Emotional Support', count: 456, percentage: 18 },
                  { topic: 'Meditation Guidance', count: 398, percentage: 16 },
                  { topic: 'General Wellness', count: 234, percentage: 9 },
              ];

    if (topicTotal === 0) {
        fallbackModules.push('chatbot.topTopics');
        notes.push(
            'Topic analytics not available in event metadata. Returned fallback topic distribution.',
        );
    }

    const liveSessions = activeLiveSessions.map((session) => ({
        id: session.id,
        user: session.user.name ?? `User #${session.userId}`,
        practice: session.title ?? 'Chatbot Conversation',
        duration: getDurationLabel(session.startedAt),
    }));

    const [
        homeVisitEvents,
        chatbotStartedUsers,
        practiceSelectedUsers,
        completedUsers,
    ] = await Promise.all([
        prisma.analyticsEvent.findMany({
            where: {
                eventName: {
                    in: ['home_visit', 'app_opened', 'dashboard_opened'],
                },
                userId: {
                    not: null,
                },
            },
            distinct: ['userId'],
            select: {
                userId: true,
            },
        }),
        prisma.chatSession.findMany({
            distinct: ['userId'],
            select: {
                userId: true,
            },
        }),
        prisma.practiceFeedback.findMany({
            distinct: ['userId'],
            select: {
                userId: true,
            },
        }),
        prisma.chatSession.findMany({
            where: {
                endedAt: {
                    not: null,
                },
            },
            distinct: ['userId'],
            select: {
                userId: true,
            },
        }),
    ]);

    let homeVisitUsers = homeVisitEvents.length;
    if (homeVisitUsers === 0) {
        homeVisitUsers = totalUsers;
        fallbackModules.push('funnel.homeVisit');
        notes.push(
            'Home visit analytics is unavailable. Used total users as funnel entry step.',
        );
    }

    const funnelStepsRaw = [
        {
            step: 'Home Visit',
            users: homeVisitUsers,
        },
        {
            step: 'Chatbot Started',
            users: chatbotStartedUsers.length,
        },
        {
            step: 'Practice Selected',
            users: practiceSelectedUsers.length,
        },
        {
            step: 'Session Completed',
            users: completedUsers.length,
        },
    ];

    const funnel = funnelStepsRaw.map((item, index) => {
        const previous = index > 0 ? funnelStepsRaw[index - 1] : null;
        const dropoff =
            previous && previous.users > 0
                ? toPercent(
                      ((previous.users - item.users) / previous.users) * 100,
                  )
                : null;

        return {
            step: item.step,
            users: item.users,
            dropoff,
            percentage:
                homeVisitUsers > 0
                    ? toPercent((item.users / homeVisitUsers) * 100)
                    : 0,
        };
    });

    return {
        mainStats: {
            totalUsers: toDashboardStat(
                totalUsers,
                computeTrend(currentUsers, previousUsers),
            ),
            activeSessions: toDashboardStat(
                activeSessions,
                computeTrend(currentStartedSessions, previousStartedSessions),
            ),
            completionRate: toDashboardStat(
                `${toPercent(completionRateValue)}%`,
                computeTrend(currentCompletionRate, previousCompletionRate),
            ),
            avgSessionTime: toDashboardStat(
                formatMinutes(avgSessionMinutes),
                computeTrend(avgCurrentWeekMinutes, avgPreviousWeekMinutes),
            ),
        },
        charts: {
            userActivity,
            practiceDistribution,
            completionRates,
        },
        chatbot: {
            stats: {
                totalConversations: toDashboardStat(
                    totalConversations,
                    computeTrend(currentConversations, previousConversations),
                ),
                avgResponseTime: toDashboardStat(
                    formatSeconds(avgResponseTimeSeconds),
                    -0.3,
                ),
                userSatisfaction: {
                    value: `${satisfactionAverage.toFixed(1)}/5`,
                    trend: computeTrend(
                        satisfactionCurrentAverage,
                        satisfactionPreviousAverage,
                    ),
                },
                resolutionRate: toDashboardStat(
                    `${toPercent(completionRateValue)}%`,
                    computeTrend(currentCompletionRate, previousCompletionRate),
                ),
            },
            topTopics,
            liveSessions,
        },
        recentActivity,
        funnel,
        meta: {
            generatedAt: new Date().toISOString(),
            fallbackModules: [...new Set(fallbackModules)],
            notes: [...new Set(notes)],
        },
    };
}

export default {
    getDashboardOverview,
};
