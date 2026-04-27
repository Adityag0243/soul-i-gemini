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

export interface Topic {
  topic: string;
  count: number;
  percentage: number;
}

export interface LiveSession {
  id: string;
  user: string;
  practice: string;
  duration: string;
}

export interface DashboardOverview {
  mainStats: {
    totalUsers: DashboardStat;
    activeSessions: DashboardStat;
    completionRate: DashboardStat;
    avgSessionTime: DashboardStat;
  };
  charts: {
    userActivity: ActivityPoint[];
    practiceDistribution: DistributionPoint[];
    completionRates: { practice: string; rate: number }[];
  };
  activities: RecentActivity[];
  chatbot: {
    stats: {
      totalConversations: DashboardStat;
      avgResponseTime: DashboardStat;
      userSatisfaction: { value: string; trend: number };
      resolutionRate: DashboardStat;
    };
    topTopics: Topic[];
    liveSessions: LiveSession[];
  };
  analytics: {
    voicePreferences: { name: string; count: number; percentage: number; color: string }[];
    controlsUsage: { name: string; count: number; percentage: number }[];
  };
  funnel: {
    step: string;
    users: number;
    dropoff: number | null;
    percentage: number;
  }[];
  footerStats: {
    positiveFeedback: number;
    activeFeatures: string;
    totalContent: number;
  };
}
