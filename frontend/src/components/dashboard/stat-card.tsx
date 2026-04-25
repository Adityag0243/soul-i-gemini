import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardStatCardProps {
  label: string;
  value: string | number;
  trend: number;
  trendLabel?: string;
  className?: string;
}

export function DashboardStatCard({ label, value, trend, trendLabel, className }: DashboardStatCardProps) {
  const isPositive = trend >= 0;
  
  return (
    <div className={cn("bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md transition-shadow", className)}>
      <p className="text-zinc-500 font-bold text-sm mb-2">{label}</p>
      <h3 className="text-3xl font-extrabold text-zinc-900 mb-4">{value}</h3>
      <div className="flex items-center gap-1.5">
        <div className={cn(
          "flex items-center gap-0.5 font-bold text-[13px]",
          isPositive ? "text-emerald-500" : "text-rose-500"
        )}>
          {isPositive ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
          <span>{isPositive ? "+" : ""}{trend}%</span>
        </div>
        <span className="text-zinc-400 text-[13px] font-medium">{trendLabel}</span>
      </div>
    </div>
  );
}
