import { DashboardOverview } from "@/types/dashboard";
import apiClient from "@/lib/axios";

export const dashboardService = {
  async getOverview(): Promise<DashboardOverview> {
    try {
      const response = await apiClient.get('/admin/dashboard/overview');
      const apiData = response.data.data;
      
      // Map API response to the frontend interface
      return {
        ...apiData,
        activities: apiData.recentActivity || [],
        // Provide fallbacks for fields the UI expects but the backend might not send yet
        footerStats: apiData.footerStats || {
          positiveFeedback: 0,
          activeFeatures: "0/0",
          totalContent: 0,
        },
        analytics: apiData.analytics || {
          voicePreferences: [],
          controlsUsage: [],
        }
      };
    } catch (error) {
      console.error("Error fetching dashboard overview:", error);
      throw error;
    }
  }
};
