import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { task } from "@/db/schema";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar } from "@/components/shell/sidebar";
import { listAccessibleWorkspaces, requireUser } from "@/server/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const workspaces = await listAccessibleWorkspaces(user);
  const wsIds = workspaces.map((w) => w.id);
  let inboxCount = 0;
  if (wsIds.length) {
    const rows = await db
      .select({ id: task.id })
      .from(task)
      .where(
        user.role === "owner"
          ? and(inArray(task.workspaceId, wsIds), or(eq(task.status, "in_review"), eq(task.status, "blocked")))
          : and(inArray(task.workspaceId, wsIds), eq(task.assigneeId, user.id), inArray(task.status, ["in_progress", "blocked", "in_review"])),
      );
    inboxCount = rows.length;
  }
  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} workspaces={workspaces} inboxCount={inboxCount} />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileNav workspaces={workspaces.filter((w) => !w.archivedAt)} isOwner={user.role === "owner"} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
