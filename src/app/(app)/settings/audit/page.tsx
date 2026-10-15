import { desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell/page-header";
import { TimeAgo } from "@/components/common/time";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { requireOwner } from "@/server/auth";

export const metadata = { title: "Audit log" };

export default async function AuditPage() {
  await requireOwner();
  const rows = await db.query.auditLog.findMany({ orderBy: [desc(auditLog.createdAt)], limit: 300 });
  const users = await db.query.user.findMany({ columns: { id: true, name: true } });
  const wss = await db.query.workspace.findMany({ columns: { id: true, name: true } });
  const uName = (id: string | null) => users.find((u) => u.id === id)?.name ?? "system";
  const wName = (id: string | null) => wss.find((w) => w.id === id)?.name ?? "";
  return (
    <div className="p-5 max-w-5xl">
      <PageHeader title="Audit log" description="Who did what, most recent first (last 300 entries)." eyebrow="Settings" />
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">When</th>
              <th className="text-left px-3 py-2 font-medium">Actor</th>
              <th className="text-left px-3 py-2 font-medium">Action</th>
              <th className="text-left px-3 py-2 font-medium">Workspace</th>
              <th className="text-left px-3 py-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground"><TimeAgo date={r.createdAt} /></td>
                <td className="px-3 py-1.5">{uName(r.actorId)}</td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-1.5">{wName(r.workspaceId)}</td>
                <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground truncate max-w-[320px]">{Object.keys(r.meta).length ? JSON.stringify(r.meta) : ""}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nothing logged yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
