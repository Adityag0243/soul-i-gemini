import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  className?: string;
  type?: "worse" | "better" | "same" | "default";
}

export function StatCard({ label, value, className, type = "default" }: StatCardProps) {
  const styles = {
    worse: {
      border: "border-red-200",
      text: "text-red-600",
      icon: TrendingDown,
    },
    better: {
      border: "border-green-200",
      text: "text-green-600",
      icon: TrendingUp,
    },
    same: {
      border: "border-zinc-200",
      text: "text-zinc-600",
      icon: Minus,
    },
    default: {
      border: "border-teal-600/50",
      text: "text-zinc-900",
      icon: null,
    },
  }[type];

  const Icon = styles.icon;

  return (
    <div className={cn(
      "flex flex-col gap-4 rounded-xl border p-5 bg-white min-w-[240px] shadow-sm transition-all",
      styles.border,
      className
    )}>
      <div className="flex items-center gap-2">
        <span className={cn("font-bold text-base", styles.text)}>{label}</span>
        {Icon && <Icon className={cn("size-4", styles.text)} />}
      </div>
      <span className={cn("text-4xl font-bold", styles.text)}>{value}</span>
    </div>
  );
}
