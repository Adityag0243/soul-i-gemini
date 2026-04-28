interface FeedbackHeaderProps {
  title: string;
  subtitle: string;
}

export function FeedbackHeader({ title, subtitle }: FeedbackHeaderProps) {
  return (
    <div className="flex flex-col mb-8">
      <h1 className="text-3xl font-bold text-zinc-900 leading-tight">{title}</h1>
      <p className="text-zinc-500 font-medium">{subtitle}</p>
    </div>
  );
}
