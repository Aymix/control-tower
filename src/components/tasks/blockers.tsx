"use client";
import { X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TaskStatus } from "@/db/schema";
import { addBlocker, removeBlocker } from "@/server/actions/tasks";

type B = { id: string; number: number; title: string; status: TaskStatus };

export function Blockers({ taskId, slug, blockedBy, blocking }: { taskId: string; slug: string; blockedBy: B[]; blocking: B[] }) {
  const router = useRouter();
  const [n, setN] = useState("");
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">Dependencies</h2>
      <div className="text-xs text-muted-foreground">Blocked by</div>
      <div className="flex flex-wrap gap-1.5">
        {blockedBy.map((b) => (
          <span key={b.id} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs">
            <Link href={`/w/${slug}/tasks/${b.number}`} className="hover:underline font-mono">T-{b.number}</Link>
            <span className="truncate max-w-[160px]">{b.title}</span>
            <StatusBadge status={b.status} className="text-[10px] py-0" />
            <button
              className="text-muted-foreground hover:text-foreground"
              aria-label="Remove dependency"
              onClick={async () => {
                const r = await removeBlocker(taskId, b.id);
                if (!r.ok) toast.error(r.error);
                else router.refresh();
              }}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <form
          className="flex gap-1"
          onSubmit={async (e) => {
            e.preventDefault();
            const num = Number.parseInt(n.replace(/^t-?/i, ""), 10);
            if (!num) return;
            const r = await addBlocker(taskId, num);
            if (!r.ok) toast.error(r.error);
            else {
              setN("");
              router.refresh();
            }
          }}
        >
          <Input value={n} onChange={(e) => setN(e.target.value)} placeholder="T-12" className="h-7 w-20 text-xs" />
          <Button type="submit" size="xs" variant="outline">Add</Button>
        </form>
      </div>
      {blocking.length ? (
        <>
          <div className="text-xs text-muted-foreground mt-2">Blocks</div>
          <div className="flex flex-wrap gap-1.5">
            {blocking.map((b) => (
              <Link key={b.id} href={`/w/${slug}/tasks/${b.number}`} className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs hover:bg-accent">
                <span className="font-mono">T-{b.number}</span> <span className="truncate max-w-[160px]">{b.title}</span>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
