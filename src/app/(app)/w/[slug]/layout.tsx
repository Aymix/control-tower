import { AlertTriangle } from "lucide-react";
import { notFound } from "next/navigation";
import { NavLink } from "@/components/shell/nav-link";
import { TimeAgo } from "@/components/common/time";
import { NotFoundError, requireUser, requireWorkspace } from "@/server/auth";

const tabs = [
  { href: "", label: "Overview", exact: true },
  { href: "/board", label: "Board" },
  { href: "/proposals", label: "Proposals" },
  { href: "/knowledge", label: "Knowledge" },
  { href: "/rules", label: "Rules" },
  { href: "/repos", label: "Repos" },
  { href: "/prs", label: "PRs" },
  { href: "/sessions", label: "Sessions" },
  { href: "/briefings", label: "Briefings" },
  { href: "/usage", label: "Usage" },
];

export default async function WorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  let ws;
  try {
    ws = await requireWorkspace(user, slug);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const base = `/w/${ws.slug}`;
  return (
    <div className="flex flex-col min-h-full">
      <header className="border-b bg-background/95 sticky top-0 z-10">
        <div className="px-5 pt-3 flex items-center gap-3">
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">{ws.clientName}</div>
            <h2 className="font-semibold tracking-tight truncate flex items-center gap-2">
              {ws.name}
              {ws.archivedAt ? <span className="text-[11px] rounded border px-1.5 py-0.5 text-muted-foreground font-normal">Archived</span> : null}
            </h2>
          </div>
        </div>
        <nav className="px-3 mt-2 flex gap-0.5 overflow-x-auto">
          {tabs.map((t) => (
            <NavLink
              key={t.href}
              href={base + t.href}
              exact={t.exact}
              className="px-2.5 py-2 text-sm text-muted-foreground border-b-2 border-transparent hover:text-foreground whitespace-nowrap -mb-px"
              activeClassName="text-foreground border-foreground"
            >
              {t.label}
            </NavLink>
          ))}
          {user.role === "owner" ? (
            <NavLink
              href={`${base}/settings`}
              className="px-2.5 py-2 text-sm text-muted-foreground border-b-2 border-transparent hover:text-foreground whitespace-nowrap -mb-px ml-auto"
              activeClassName="text-foreground border-foreground"
            >
              Settings
            </NavLink>
          ) : null}
        </nav>
      </header>
      {ws.githubPollError ? (
        <div className="border-b bg-amber-500/10 text-amber-900 dark:text-amber-200 px-5 py-2 text-sm flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span className="truncate">
            GitHub polling is failing: {ws.githubPollError}
          </span>
          <span className="ml-auto text-xs opacity-70 shrink-0">
            <TimeAgo date={ws.githubPollErrorAt} />
          </span>
        </div>
      ) : null}
      <div className="p-5 flex-1 min-w-0">{children}</div>
    </div>
  );
}
