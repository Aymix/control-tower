import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-dashed p-8 text-center flex flex-col items-center gap-2", className)}>
      {Icon ? <Icon className="size-6 text-muted-foreground" /> : null}
      <div className="font-medium">{title}</div>
      {description ? <div className="text-sm text-muted-foreground max-w-md">{description}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
