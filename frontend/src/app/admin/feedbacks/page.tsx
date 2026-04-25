"use client";

import * as React from "react";
import { FeedbackHeader } from "@/components/feedbacks/feedback-header";
import { FeedbackCard } from "@/components/feedbacks/feedback-card";
import { StatCard } from "@/components/shared/stat-card";
import { feedbackService } from "@/services/feedback-service";
import { Feedback, FeedbackStats, FeedbackType } from "@/types/feedback";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function FeedbacksPage() {
  const [feedbacks, setFeedbacks] = React.useState<Feedback[]>([]);
  const [stats, setStats] = React.useState<FeedbackStats | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<FeedbackType | "all">("all");

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [fData, sData] = await Promise.all([
        feedbackService.getFeedbacks(),
        feedbackService.getStats(),
      ]);
      setFeedbacks(fData);
      setStats(sData);
    } catch (error) {
      console.error("Error fetching feedbacks:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredFeedbacks = feedbacks.filter((f) => 
    filter === "all" ? true : f.type === filter
  );

  return (
    <div className="max-w-[1200px] mx-auto">
      <FeedbackHeader 
        title="Reports & Feedback" 
        subtitle="Manage user reports and feedbacks for the mobile app" 
      />

      {isLoading && !feedbacks.length ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="size-10 animate-spin text-teal-600" />
        </div>
      ) : (
        <>
          <div className="flex gap-10 mb-8">
            <StatCard label="Worse" value={stats?.worse ?? 0} type="worse" />
            <StatCard label="Better" value={stats?.better ?? 0} type="better" />
            <StatCard label="Same" value={stats?.same ?? 0} type="same" />
          </div>

          <div className="rounded-xl border border-teal-600/50 p-6 bg-white mb-8">
            <h3 className="text-sm font-bold text-zinc-900 mb-4 tracking-tight">Filter by feedback type:</h3>
            <div className="flex gap-3">
              <FilterButton 
                active={filter === "all"} 
                onClick={() => setFilter("all")}
                label="All"
              />
              <FilterButton 
                active={filter === "worse"} 
                onClick={() => setFilter("worse")}
                label="Worse"
                icon={<TrendingDown className="size-4" />}
                color="red"
              />
              <FilterButton 
                active={filter === "better"} 
                onClick={() => setFilter("better")}
                label="Better"
                icon={<TrendingUp className="size-4" />}
                color="green"
              />
              <FilterButton 
                active={filter === "same"} 
                onClick={() => setFilter("same")}
                label="Same"
                icon={<Minus className="size-4" />}
                color="zinc"
              />
            </div>
          </div>

          <div className="flex flex-col gap-6">
            {filteredFeedbacks.map((item) => (
              <FeedbackCard 
                key={item.id} 
                feedback={item} 
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FilterButton({ active, onClick, label, icon, color = "teal" }: any) {
  const colorStyles: any = {
    teal: active ? "bg-[#009688] text-white" : "text-teal-600 border-teal-600/50",
    red: active ? "bg-red-500 text-white" : "text-red-500 border-red-500/50",
    green: active ? "bg-green-500 text-white" : "text-green-500 border-green-500/50",
    zinc: active ? "bg-zinc-700 text-white" : "text-zinc-500 border-zinc-500/50",
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className={cn(
        "rounded-full px-5 h-9 font-bold flex items-center gap-2 border transition-all",
        colorStyles[color]
      )}
    >
      {label}
      {icon}
    </Button>
  );
}
