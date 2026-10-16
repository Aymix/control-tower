import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { kbDocument, kbVersion, orgSettings, repo, workspace } from "@/db/schema";
import { mergeManagedSection, renderManagedSection } from "@/lib/claude-md/render";
import { env } from "@/lib/env";
import { describeGithubError, GithubNotConfigured, octokitFor } from "@/server/github";

const BRANCH = "control-tower/claude-md";

export async function renderClaudeMdForWorkspace(workspaceId: string): Promise<string> {
  const ws = (await db.query.workspace.findFirst({ where: eq(workspace.id, workspaceId) }))!;
  const org = (await db.query.orgSettings.findFirst({ where: eq(orgSettings.id, "org") })) ?? { name: "Control Tower", globalRules: "", guardrails: "" };
  const pinned = await db.query.kbDocument.findMany({ where: and(eq(kbDocument.workspaceId, ws.id), eq(kbDocument.pinned, true), isNull(kbDocument.archivedAt)), orderBy: (d, { asc }) => [asc(d.title)] });
  const docs = await Promise.all(
    pinned.map(async (d) => {
      const v = await db.query.kbVersion.findFirst({ where: and(eq(kbVersion.documentId, d.id), eq(kbVersion.version, d.currentVersion)) });
      return { title: d.title, kind: d.kind, content: v?.content ?? "" };
    }),
  );
  return renderManagedSection({ orgName: org.name, workspaceName: ws.name, clientName: ws.clientName, globalRules: org.globalRules, guardrails: org.guardrails, workspaceRules: ws.rules, docs, towerUrl: env().APP_URL });
}

/**
 * Updates CLAUDE.md on a branch and opens (or refreshes) a PR. Never writes to the default branch.
 * Returns "unchanged" when the merged file equals the current default-branch file.
 */
export async function syncClaudeMd(repoId: string): Promise<{ ok: true; status: "unchanged" | "pr_opened" | "pr_updated"; prUrl?: string } | { ok: false; error: string }> {
  const r = await db.query.repo.findFirst({ where: eq(repo.id, repoId), with: { workspace: true } });
  if (!r) return { ok: false, error: "Repo not found." };
  try {
    const octokit = octokitFor(r.workspace);
    const managed = await renderClaudeMdForWorkspace(r.workspaceId);
    const { owner, name: repoName, defaultBranch } = r;

    const existing = await getFile(octokit, owner, repoName, "CLAUDE.md", defaultBranch);
    const merged = mergeManagedSection(existing?.content ?? null, managed);
    const hash = createHash("sha256").update(merged.content).digest("hex");
    if (!merged.changed) {
      await db.update(repo).set({ claudeMdSyncedAt: new Date(), claudeMdHash: hash, claudeMdError: null }).where(eq(repo.id, r.id));
      return { ok: true, status: "unchanged" };
    }

    // Branch off the default branch (create or reset to the current head of default).
    const { data: base } = await octokit.git.getRef({ owner, repo: repoName, ref: `heads/${defaultBranch}` });
    const branchExists = await octokit.git.getRef({ owner, repo: repoName, ref: `heads/${BRANCH}` }).then(() => true).catch(() => false);
    if (!branchExists) await octokit.git.createRef({ owner, repo: repoName, ref: `refs/heads/${BRANCH}`, sha: base.object.sha });

    const onBranch = await getFile(octokit, owner, repoName, "CLAUDE.md", BRANCH);
    if (onBranch?.content !== merged.content) {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo: repoName,
        path: "CLAUDE.md",
        branch: BRANCH,
        message: existing ? "chore: sync CLAUDE.md from Control Tower" : "chore: add CLAUDE.md from Control Tower",
        content: Buffer.from(merged.content, "utf8").toString("base64"),
        sha: onBranch?.sha,
      });
    }
    const { data: prs } = await octokit.pulls.list({ owner, repo: repoName, head: `${owner}:${BRANCH}`, state: "open" });
    let prUrl: string;
    let status: "pr_opened" | "pr_updated";
    if (prs[0]) {
      prUrl = prs[0].html_url;
      status = "pr_updated";
    } else {
      const { data: pr } = await octokit.pulls.create({
        owner,
        repo: repoName,
        title: "Sync CLAUDE.md from Control Tower",
        head: BRANCH,
        base: defaultBranch,
        body: `Updates the Control Tower managed section of \`CLAUDE.md\` (rules, guardrails and pinned knowledge for **${r.workspace.name}**). Content outside the markers is untouched.\n\nMerge when it looks right; the next sync will reuse this branch.`,
      });
      prUrl = pr.html_url;
      status = "pr_opened";
    }
    await db.update(repo).set({ claudeMdSyncedAt: new Date(), claudeMdHash: hash, claudeMdPrUrl: prUrl, claudeMdError: null }).where(eq(repo.id, r.id));
    return { ok: true, status, prUrl };
  } catch (err) {
    const msg = err instanceof GithubNotConfigured ? err.message : describeGithubError(err);
    await db.update(repo).set({ claudeMdError: msg, claudeMdSyncedAt: new Date() }).where(eq(repo.id, r.id));
    return { ok: false, error: msg };
  }
}

async function getFile(octokit: ReturnType<typeof octokitFor>, owner: string, repoName: string, path: string, ref: string): Promise<{ content: string; sha: string } | null> {
  try {
    const { data } = await octokit.repos.getContent({ owner, repo: repoName, path, ref });
    if (Array.isArray(data) || data.type !== "file") return null;
    return { content: Buffer.from(data.content, "base64").toString("utf8"), sha: data.sha };
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}
