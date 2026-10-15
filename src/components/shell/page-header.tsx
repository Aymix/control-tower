import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b pb-4 mb-5", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="text-xs text-muted-foreground mb-0.5">{eyebrow}</div> : null}
        <h1 className="text-lg font-semibold tracking-tight leading-7 truncate">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}
