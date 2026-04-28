export interface Feature {
  featureKey: string;
  featureName: string;
  category: string;
  description: string;
  enabled: boolean;
  updatedAt?: string;
}

export interface FeatureSummary {
  totalFeatures: number;
  activeFeatures: number;
  disabledFeatures: number;
}

export interface FeatureResponse {
  message: string;
  success: boolean;
  data: {
    summary: FeatureSummary;
    features: Feature[];
  };
}
