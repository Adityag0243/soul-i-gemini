import { Feedback } from "@/types/feedback";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

interface FeedbackCardProps {
  feedback: Feedback;
}

export function FeedbackCard({ feedback }: FeedbackCardProps) {
  const styles = {
    worse: {
      border: "border-red-200",
      avatar: "bg-red-600",
      iconColor: "text-red-500",
    },
    better: {
      border: "border-green-200",
      avatar: "bg-green-600",
      iconColor: "text-green-500",
    },
    same: {
      border: "border-zinc-300",
      avatar: "bg-zinc-600",
      iconColor: "text-zinc-500",
    },
  }[feedback.type];

  // Get initials for avatar
  const initials = feedback.userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const formattedDate = new Date(feedback.createdAt).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).split("/").join("-");

  const formattedTime = new Date(feedback.createdAt).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    <div className={cn(
      "rounded-xl border p-6 bg-white shadow-sm transition-shadow",
      styles.border
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className={cn(
            "size-12 rounded-full flex items-center justify-center text-white font-bold text-lg",
            styles.avatar
          )}>
            {initials}
          </div>
          <h3 className="text-xl font-bold text-zinc-900">{feedback.userName}</h3>
        </div>

        <div className="text-right">
          <div className="text-[10px] font-bold text-zinc-500">{formattedDate}</div>
          <div className="text-[10px] font-bold text-zinc-500">{formattedTime}</div>
        </div>
      </div>

      <div className="ml-16 relative">
        <div className="bg-white rounded-2xl p-4 border border-zinc-200 flex items-start gap-3">
          <MessageSquare className="size-5 text-zinc-400 mt-0.5 shrink-0" />
          <p className="text-sm text-zinc-600 font-medium leading-relaxed">
            {feedback.message}
          </p>
        </div>
      </div>
    </div>
  );
}
