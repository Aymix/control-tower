import parseDiff from "parse-diff";

export type DiffLineType = "add" | "del" | "normal";

export type DiffLine = {
  type: DiffLineType;
  content: string; // without the leading +/-/space
  oldLine: number | null;
  newLine: number | null;
};

export type DiffHunk = {
  header: string;
  lines: DiffLine[];
};

export type DiffFile = {
  path: string;
  oldPath: string | null;
  status: "added" | "deleted" | "modified" | "renamed";
  additions: number;
  deletions: number;
  binary: boolean;
  hunks: DiffHunk[];
};

/** Parses a unified diff (GitHub `.diff` payload) into renderable files. */
export function parseUnifiedDiff(text: string): DiffFile[] {
  const files = parseDiff(text);
  return files.map((f) => {
    const to = norm(f.to);
    const from = norm(f.from);
    const status: DiffFile["status"] = f.new
      ? "added"
      : f.deleted
        ? "deleted"
        : from && to && from !== to
          ? "renamed"
          : "modified";
    return {
      path: to ?? from ?? "(unknown)",
      oldPath: status === "renamed" ? from : null,
      status,
      additions: f.additions,
      deletions: f.deletions,
      binary: f.chunks.length === 0 && (f.additions === 0 && f.deletions === 0),
      hunks: f.chunks.map((c) => ({
        header: c.content,
        lines: c.changes.map((ch) => {
          if (ch.type === "add") return { type: "add", content: ch.content.slice(1), oldLine: null, newLine: ch.ln };
          if (ch.type === "del") return { type: "del", content: ch.content.slice(1), oldLine: ch.ln, newLine: null };
          return { type: "normal", content: ch.content.slice(1), oldLine: ch.ln1, newLine: ch.ln2 };
        }),
      })),
    };
  });
}

function norm(p: string | undefined): string | null {
  if (!p || p === "/dev/null") return null;
  return p.replace(/^[ab]\//, "");
}

export type SideBySideRow = {
  left: DiffLine | null;
  right: DiffLine | null;
};

/**
 * Pairs deletions with the additions that immediately follow them so that a
 * changed line shows left/right on the same row. Unpaired lines get an empty
 * opposite cell.
 */
export function toSideBySide(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.type === "normal") {
      rows.push({ left: l, right: l });
      i++;
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].type === "del") dels.push(lines[i++]);
    while (i < lines.length && lines[i].type === "add") adds.push(lines[i++]);
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) rows.push({ left: dels[k] ?? null, right: adds[k] ?? null });
  }
  return rows;
}
