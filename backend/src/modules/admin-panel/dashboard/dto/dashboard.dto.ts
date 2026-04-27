export interface DashboardStat {
    value: string | number;
    trend: number;
    trendLabel: string;
}

export interface ActivityPoint {
    label: string;
    users: number;
    sessions: number;
}

export interface DistributionPoint {
    name: string;
    value: number;
    color: string;
}

export interface RecentActivity {
    id: string;
    userName: string;
    action: string;
    timestamp: string;
    type: 'info' | 'success' | 'warning' | 'error';
}

export interface DashboardOverviewDto {
    mainStats: {
        totalUsers: DashboardStat;
        activeSessions: DashboardStat;
        completionRate: DashboardStat;
        avgSessionTime: DashboardStat;
    };
    charts: {
        userActivity: ActivityPoint[];
        practiceDistribution: DistributionPoint[];
        completionRates: {
            practice: string;
            rate: number;
        }[];
    };
    chatbot: {
        stats: {
            totalConversations: DashboardStat;
            avgResponseTime: DashboardStat;
            userSatisfaction: { value: string; trend: number };
            resolutionRate: DashboardStat;
        };
        topTopics: {
            topic: string;
            count: number;
            percentage: number;
        }[];
        liveSessions: {
            id: string;
            user: string;
            practice: string;
            duration: string;
        }[];
    };
    recentActivity: RecentActivity[];
    funnel: {
        step: string;
        users: number;
        dropoff: number | null;
        percentage: number;
    }[];
    meta: {
        generatedAt: string;
        fallbackModules: string[];
        notes: string[];
    };
}
