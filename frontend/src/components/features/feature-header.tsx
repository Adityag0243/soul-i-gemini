interface FeatureHeaderProps {
  title: string;
  subtitle: string;
}

export function FeatureHeader({ title, subtitle }: FeatureHeaderProps) {
  return (
    <div className="flex flex-col mb-8">
      <h1 className="text-3xl font-bold text-zinc-900 leading-tight">{title}</h1>
      <p className="text-zinc-500 font-medium tracking-tight">{subtitle}</p>
    </div>
  );
}
