import { Feature } from "@/types/feature";
import { cn } from "@/lib/utils";

interface FeatureCardProps {
  feature: Feature;
  onToggle?: () => void;
}

export function FeatureCard({ feature, onToggle }: FeatureCardProps) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-teal-600/50 p-6 bg-white shadow-sm transition-shadow">
      <div className="space-y-1.5 flex-1 pr-8">
        <div className="flex items-center gap-3">
          <h3 className="text-xl font-bold text-zinc-900">{feature.featureName}</h3>
          <span className="px-3 py-0.5 rounded-full bg-[#A78BFA] text-white text-[10px] font-bold uppercase tracking-wider">
            {feature.category}
          </span>
          <span className={cn(
            "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
            feature.enabled ? "bg-green-50 text-green-600 border border-green-100" : "bg-zinc-100 text-zinc-500 border border-zinc-200"
          )}>
            {feature.enabled ? "Active" : "Disabled"}
          </span>
        </div>
        <p className="text-sm text-zinc-500 font-medium leading-relaxed max-w-2xl">
          {feature.description}
        </p>
      </div>

      <button
        onClick={onToggle}
        className={cn(
          "relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-teal-500/20",
          feature.enabled ? "bg-[#009688]" : "bg-zinc-200"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none inline-block size-7 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
            feature.enabled ? "translate-x-6" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}
