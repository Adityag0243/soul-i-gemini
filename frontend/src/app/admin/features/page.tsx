"use client";

import * as React from "react";
import { FeatureHeader } from "@/components/features/feature-header";
import { FeatureCard } from "@/components/features/feature-card";
import { StatCard } from "@/components/shared/stat-card";
import { featureService } from "@/services/feature-service";
import { Feature, FeatureSummary } from "@/types/feature";
import { Loader2 } from "lucide-react";

export default function FeaturesPage() {
  const [features, setFeatures] = React.useState<Feature[]>([]);
  const [stats, setStats] = React.useState<FeatureSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await featureService.getFeatures();
      setFeatures(response.data.features);
      setStats(response.data.summary);
    } catch (error) {
      console.error("Error fetching features:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggle = async (feature: Feature) => {
    try {
      await featureService.toggleFeature(feature.featureKey, !feature.enabled);
      await fetchData(); // Refresh data
    } catch (error) {
      console.error("Error toggling feature:", error);
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto">
      <FeatureHeader
        title="Feature Control"
        subtitle="Manage feature availability and rollout for users"
      />

      {isLoading && !features.length ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-10 animate-spin text-teal-600" />
        </div>
      ) : (
        <>
          <div className="flex gap-10 mb-12">
            <StatCard label="Total Features" value={stats?.totalFeatures ?? 0} />
            <StatCard label="Active" value={stats?.activeFeatures ?? 0} type="better" />
            <StatCard label="Disabled" value={stats?.disabledFeatures ?? 0} type="same" />
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-zinc-900 leading-tight">All Features</h2>
            <p className="text-zinc-500 font-medium tracking-tight">Toggle features on or off to control availability in the mobile app</p>
          </div>

          <div className="flex flex-col gap-6">
            {features.map((feature) => (
              <FeatureCard
                key={feature.featureKey}
                feature={feature}
                onToggle={() => handleToggle(feature)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
