# Phase 4 manual checklist — external sources and CLAUDE.md sync

## Sources (Knowledge → Sources)

- [ ] Add a public URL (e.g. a docs page). It syncs immediately and a “source snapshot” document appears in the knowledge base with a header linking the original.
- [ ] Adding `http://localhost:3000` or `http://192.168.1.1` is refused ("Only public http(s) URLs are allowed").
- [ ] Add a Google Doc shared as “Anyone with the link can view”: the text is imported. A private doc fails with the sign-in hint.
- [ ] Add a Notion page with an internal integration token (page shared with the integration): headings, lists, to-dos, code and tables come through. The token shows as ••••XXXX.
- [ ] Add a Confluence page URL with Atlassian email + API token: the page body is converted; `_links.webui` becomes the "open original" link.
- [ ] "Sync now" on an unchanged source does not create a new version; after editing the original it creates v2 with note "Re-synced from source".
- [ ] Settings on a source: rename, pin, change interval. Pinning also pins the snapshot document; it then shows on the workspace overview and in the Claude session context.
- [ ] Set interval to "Hour", backdate `last_synced_at` by 2 hours in the DB: the worker's `sources.sync` job re-syncs within 5 minutes (worker log: "sources: 1 due").
- [ ] A failing source shows its error on the row and in the worker log, without affecting other sources.
- [ ] Removing a source keeps the document; archiving happens from the document page.
- [ ] Devs can add and sync sources; only the owner sees "Sync CLAUDE.md".

## CLAUDE.md sync (Repos)

- [ ] With a PAT with write access: "Sync CLAUDE.md" creates branch `control-tower/claude-md`, commits CLAUDE.md with the managed section (rules, guardrails, workspace rules, pinned docs) and opens a PR against the default branch. The row shows "synced … · PR".
- [ ] Running it again without changes reports "already up to date" and does not touch the branch.
- [ ] Change a workspace rule, sync again: the same branch and PR are updated (no second PR).
- [ ] A repo whose CLAUDE.md has content outside the markers keeps that content after merge; only the marked section changes.
- [ ] Without a PAT or with a read-only token the button is disabled / the row shows the GitHub error.
- [ ] The managed section never exceeds ~40k chars; long pinned docs are truncated with a note.
