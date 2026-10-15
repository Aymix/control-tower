"use client";
import { ChevronDown, ChevronRight, Columns2, Rows3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DiffFile, DiffLine } from "@/lib/diff/parse";
import { toSideBySide } from "@/lib/diff/parse";
import { cn } from "@/lib/utils";

type Mode = "unified" | "split";
const KEY = "ct-diff-mode";

export function DiffViewer({ files }: { files: DiffFile[] }) {
  const [mode, setMode] = useState<Mode>("unified");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // Restore the viewer's saved preference once mounted (external storage → state).
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem(KEY) as Mode | null;
        if (saved === "split" || saved === "unified") setMode(saved);
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const set = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {}
  };
  const totals = useMemo(() => files.reduce((a, f) => ({ add: a.add + f.additions, del: a.del + f.deletions }), { add: 0, del: 0 }), [files]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">
          {files.length} file{files.length === 1 ? "" : "s"} · <span className="text-emerald-600 dark:text-emerald-400">+{totals.add}</span> <span className="text-red-600 dark:text-red-400">−{totals.del}</span>
        </span>
        <div className="ml-auto inline-flex rounded-md border p-0.5">
          <Button size="xs" variant={mode === "unified" ? "secondary" : "ghost"} onClick={() => set("unified")}><Rows3 className="size-3.5" /> Unified</Button>
          <Button size="xs" variant={mode === "split" ? "secondary" : "ghost"} onClick={() => set("split")}><Columns2 className="size-3.5" /> Side by side</Button>
        </div>
      </div>
      <nav className="rounded-lg border p-2 text-xs max-h-40 overflow-auto">
        {files.map((f) => (
          <a key={f.path} href={`#f-${slug(f.path)}`} className="flex items-center gap-2 px-1 py-0.5 hover:underline">
            <span className="truncate font-mono">{f.path}</span>
            <span className="ml-auto shrink-0"><span className="text-emerald-600 dark:text-emerald-400">+{f.additions}</span> <span className="text-red-600 dark:text-red-400">−{f.deletions}</span></span>
          </a>
        ))}
      </nav>
      {files.map((f) => {
        const isCollapsed = collapsed[f.path] ?? false;
        return (
          <section key={f.path} id={`f-${slug(f.path)}`} className="rounded-lg border overflow-hidden">
            <header className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 text-xs sticky top-0">
              <button onClick={() => setCollapsed((c) => ({ ...c, [f.path]: !isCollapsed }))} className="text-muted-foreground" aria-label="Toggle file">
                {isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              </button>
              <span className={cn("rounded px-1 uppercase text-[10px] font-semibold", f.status === "added" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", f.status === "deleted" && "bg-red-500/15 text-red-700 dark:text-red-300", f.status === "renamed" && "bg-blue-500/15 text-blue-700 dark:text-blue-300", f.status === "modified" && "bg-muted text-muted-foreground")}>
                {f.status[0]}
              </span>
              <span className="font-mono truncate">{f.oldPath ? `${f.oldPath} → ` : ""}{f.path}</span>
              <span className="ml-auto shrink-0"><span className="text-emerald-600 dark:text-emerald-400">+{f.additions}</span> <span className="text-red-600 dark:text-red-400">−{f.deletions}</span></span>
            </header>
            {isCollapsed ? null : f.binary || f.hunks.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground">Binary file or no textual changes.</div>
            ) : mode === "unified" ? (
              <UnifiedFile file={f} />
            ) : (
              <SplitFile file={f} />
            )}
          </section>
        );
      })}
    </div>
  );
}

function slug(s: string) {
  return s.replace(/[^a-zA-Z0-9]+/g, "-");
}

function lineCls(t: DiffLine["type"] | undefined) {
  return t === "add" ? "diff-add" : t === "del" ? "diff-del" : "";
}

function UnifiedFile({ file }: { file: DiffFile }) {
  return (
    <table className="diff-table w-full border-collapse">
      <tbody>
        {file.hunks.map((h, hi) => (
          <HunkRows key={hi} header={h.header} colSpan={3}>
            {h.lines.map((l, li) => (
              <tr key={li} className={lineCls(l.type)}>
                <td className="diff-ln">{l.oldLine ?? ""}</td>
                <td className="diff-ln">{l.newLine ?? ""}</td>
                <td className="whitespace-pre pl-2 pr-3">
                  <span className="inline-block w-3 select-none text-muted-foreground">{l.type === "add" ? "+" : l.type === "del" ? "-" : " "}</span>
                  {l.content}
                </td>
              </tr>
            ))}
          </HunkRows>
        ))}
      </tbody>
    </table>
  );
}

function SplitFile({ file }: { file: DiffFile }) {
  return (
    <table className="diff-table w-full border-collapse table-fixed">
      <colgroup>
        <col className="w-12" />
        <col />
        <col className="w-12" />
        <col />
      </colgroup>
      <tbody>
        {file.hunks.map((h, hi) => (
          <HunkRows key={hi} header={h.header} colSpan={4}>
            {toSideBySide(h.lines).map((row, ri) => (
              <tr key={ri}>
                <td className={cn("diff-ln", lineCls(row.left?.type))}>{row.left?.oldLine ?? ""}</td>
                <td className={cn("whitespace-pre-wrap break-all pl-2 pr-3 border-r", lineCls(row.left?.type))}>{row.left?.content ?? ""}</td>
                <td className={cn("diff-ln", lineCls(row.right?.type))}>{row.right?.newLine ?? ""}</td>
                <td className={cn("whitespace-pre-wrap break-all pl-2 pr-3", lineCls(row.right?.type))}>{row.right?.content ?? ""}</td>
              </tr>
            ))}
          </HunkRows>
        ))}
      </tbody>
    </table>
  );
}

function HunkRows({ header, colSpan, children }: { header: string; colSpan: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-blue-500/5 text-blue-700 dark:text-blue-300">
        <td colSpan={colSpan} className="px-3 py-0.5 text-[11px]">{header}</td>
      </tr>
      {children}
    </>
  );
}
