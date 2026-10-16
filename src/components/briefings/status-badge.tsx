import type { BriefingStatus } from "@/db/schema";
import { cn } from "@/lib/utils";

const styles: Record<BriefingStatus, string> = {
  queued: "bg-muted text-muted-foreground border-transparent",
  drafting: "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/20",
  draft: "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/20",
  sent: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  discarded: "bg-muted text-muted-foreground border-transparent line-through",
  failed: "bg-red-500/12 text-red-700 dark:text-red-300 border-red-500/20",
};
const label: Record<BriefingStatus, string> = { queued: "Queued", drafting: "Drafting", draft: "Draft to review", sent: "Sent", discarded: "Discarded", failed: "Failed" };

export function BriefingStatusBadge({ status }: { status: BriefingStatus }) {
  return <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4", styles[status])}>{label[status]}</span>;
}
