import { Bot, Cog, UserRound } from "lucide-react";
import { Markdown } from "@/components/common/markdown";
import { TimeAgo } from "@/components/common/time";
import { ActionForm } from "@/components/forms/action-form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Comment } from "@/db/schema";
import { addComment } from "@/server/actions/tasks";
import { cn } from "@/lib/utils";

type C = Comment & { author: { name: string } | null };

export function CommentTimeline({ taskId, comments }: { taskId: string; comments: C[] }) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold">Activity</h2>
      <ol className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className={cn("flex gap-3", c.kind === "system" && "opacity-80")}>
            <div className={cn("size-6 shrink-0 rounded-full grid place-items-center mt-0.5", c.kind === "user" ? "bg-muted" : c.kind === "agent" ? "bg-violet-500/15 text-violet-600 dark:text-violet-300" : "bg-transparent text-muted-foreground")}>
              {c.kind === "user" ? <UserRound className="size-3.5" /> : c.kind === "agent" ? <Bot className="size-3.5" /> : <Cog className="size-3.5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="font-medium text-foreground">{c.kind === "system" ? "System" : c.kind === "agent" ? "Claude" : c.author?.name ?? "Unknown"}</span>
                <TimeAgo date={c.createdAt} />
              </div>
              <div className={cn("mt-0.5", c.kind === "system" && "text-sm text-muted-foreground")}>
                <Markdown>{c.body}</Markdown>
              </div>
            </div>
          </li>
        ))}
        {comments.length === 0 ? <li className="text-sm text-muted-foreground">No activity yet.</li> : null}
      </ol>
      <ActionForm action={addComment.bind(null, taskId)} resetOnSuccess className="space-y-2">
        <Textarea name="body" rows={3} placeholder="Add a comment (markdown supported)…" required />
        <div className="flex justify-end">
          <Button type="submit" size="sm">Comment</Button>
        </div>
      </ActionForm>
    </section>
  );
}
