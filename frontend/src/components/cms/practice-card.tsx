import { Trash2, Tag, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface PracticeCardProps {
  title: string;
  category: string;
  duration: string;
  type: "audio" | "video";
  description: string;
  tags: string[];
  onDelete?: () => void;
}

export function PracticeCard({
  title,
  category,
  duration,
  type,
  description,
  tags,
  onDelete,
}: PracticeCardProps) {
  return (
    <div className="relative group flex items-start justify-between rounded-xl border border-teal-600/50 p-6 bg-white shadow-sm hover:shadow-md transition-shadow">

      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2 flex-wrap">
          <h3 className="text-2xl font-bold text-zinc-900">{title}</h3>
          
          <div className="flex items-center gap-2">
            <span className={cn(
              "px-3 py-1 rounded-full text-xs font-semibold text-white",
              category.toLowerCase().includes("breath") ? "bg-[#A78BFA]" : "bg-[#A78BFA]" // Using purple as seen in meditation
            )}>
              {category}
            </span>
            
            <span className="px-3 py-1 rounded-full border border-zinc-900 text-xs font-bold text-zinc-900 flex items-center gap-1">
              {duration}
            </span>
            
            <span className={cn(
              "px-3 py-1 rounded-full text-xs font-semibold text-white",
              type === "audio" ? "bg-[#009688]" : "bg-[#00796B]"
            )}>
              {type}
            </span>
          </div>
        </div>

        <p className="text-zinc-500 mb-4 max-w-2xl leading-relaxed">
          {description}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="p-1 px-2 rounded-md bg-zinc-50 border border-zinc-100">
             <Tag className="size-4 text-zinc-500" />
          </div>
          {tags.map((tag) => (
            <span key={tag} className="px-3 py-1 rounded-full border border-zinc-400 text-xs text-zinc-600">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center p-2">
        <button 
          onClick={onDelete}
          className="p-3 rounded-lg bg-[#FFC5C5] text-zinc-800 hover:bg-[#FFB0B0] transition-colors cursor-pointer"
        >
          <Trash2 className="size-5 text-[#FF5A5A]" />
        </button>
      </div>
    </div>
  );
}
