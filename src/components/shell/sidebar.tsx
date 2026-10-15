import { Inbox, Plus, Settings, Building2, Radio } from "lucide-react";
import Link from "next/link";
import type { Workspace } from "@/db/schema";
import type { CurrentUser } from "@/server/auth";
import { NavLink } from "./nav-link";
import { UserMenu } from "./user-menu";
import { cn } from "@/lib/utils";

const linkCls =
  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors";

export function Sidebar({ user, workspaces, inboxCount }: { user: CurrentUser; workspaces: Workspace[]; inboxCount: number }) {
  const active = workspaces.filter((w) => !w.archivedAt);
  const archived = workspaces.filter((w) => w.archivedAt);
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 h-14 border-b">
        <div className="size-7 rounded-md bg-primary text-primary-foreground grid place-items-center">
          <Radio className="size-4" />
        </div>
        <Link href="/inbox" className="font-semibold tracking-tight">
          Control Tower
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-5">
        <div className="space-y-0.5">
          <NavLink href="/inbox" className={linkCls}>
            <Inbox className="size-4" />
            <span className="flex-1">Inbox</span>
            {inboxCount > 0 ? (
              <span className="text-[11px] rounded-full bg-primary/10 text-primary px-1.5 py-0.5 leading-none font-medium">{inboxCount}</span>
            ) : null}
          </NavLink>
          {user.role === "owner" ? (
            <NavLink href="/settings" className={linkCls}>
              <Settings className="size-4" />
              <span>Settings</span>
            </NavLink>
          ) : null}
        </div>
        <div>
          <div className="flex items-center justify-between px-2 mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Workspaces</span>
            {user.role === "owner" ? (
              <Link href="/settings#workspaces" className="text-muted-foreground hover:text-foreground" title="New workspace">
                <Plus className="size-3.5" />
              </Link>
            ) : null}
          </div>
          <div className="space-y-0.5">
            {active.length === 0 ? <p className="px-2 text-xs text-muted-foreground">No workspaces yet.</p> : null}
            {active.map((w) => (
              <NavLink key={w.id} href={`/w/${w.slug}`} className={linkCls}>
                <Building2 className="size-4 text-muted-foreground" />
                <span className="truncate">{w.name}</span>
              </NavLink>
            ))}
            {archived.length ? (
              <details className="mt-1">
                <summary className="px-2 text-xs text-muted-foreground cursor-pointer">Archived ({archived.length})</summary>
                {archived.map((w) => (
                  <NavLink key={w.id} href={`/w/${w.slug}`} className={cn(linkCls, "opacity-60")}>
                    <Building2 className="size-4" />
                    <span className="truncate">{w.name}</span>
                  </NavLink>
                ))}
              </details>
            ) : null}
          </div>
        </div>
      </nav>
      <div className="border-t p-2">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}
