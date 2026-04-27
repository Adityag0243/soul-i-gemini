import apiClient from "@/lib/axios";
import { FeatureResponse } from "@/types/feature";

export const featureService = {
  async getFeatures(): Promise<FeatureResponse> {
    const response = await apiClient.get<FeatureResponse>("/admin/feature-control");
    return response.data;
  },

  async toggleFeature(featureKey: string, enabled: boolean): Promise<FeatureResponse> {
    const response = await apiClient.patch<FeatureResponse>(`/admin/feature-control/${featureKey}`, {
      enabled,
    });
    return response.data;
  },
};
