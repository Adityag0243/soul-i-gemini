import { FeatureKey } from '@prisma/client';

export interface FeatureControlSummaryDto {
    totalFeatures: number;
    activeFeatures: number;
    disabledFeatures: number;
}

export interface FeatureControlItemDto {
    featureKey: FeatureKey;
    featureName: string;
    description: string;
    category: string;
    enabled: boolean;
    updatedAt: Date;
}

export interface FeatureControlListResponseDto {
    summary: FeatureControlSummaryDto;
    features: FeatureControlItemDto[];
}
