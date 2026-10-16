import { describe, expect, it } from "vitest";
import { extractTitle, htmlToMarkdown } from "@/lib/sources/html-to-markdown";
import { notionBlocksToMarkdown, notionPageId } from "@/lib/sources/notion";
import { confluencePageRef, googleDocId, isSafePublicUrl } from "@/lib/sources/refs";
import { END, START, mergeManagedSection, renderManagedSection } from "@/lib/claude-md/render";

describe("htmlToMarkdown", () => {
  it("converts headings, paragraphs, lists, links, code, tables and drops chrome", () => {
    const html = `<html><head><title>Spec &amp; notes</title><style>.x{}</style></head><body><nav>menu</nav>
      <main><h1>Checkout</h1><p>Hello <strong>world</strong> &mdash; see <a href="/docs">the docs</a>.</p>
      <ul><li>one</li><li>two <em>em</em></li></ul><ol><li>a</li><li>b</li></ol>
      <pre><code>const x = 1;</code></pre><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>
      <p>${"filler ".repeat(40)}</p></main>
      <footer>foot</footer><script>alert(1)</script></body></html>`;
    const md = htmlToMarkdown(html, { baseUrl: "https://example.com/x/" });
    expect(md).toContain("# Checkout");
    expect(md).toContain("Hello **world** — see [the docs](https://example.com/docs).");
    expect(md).toContain("- one\n- two *em*");
    expect(md).toContain("1. a\n2. b");
    expect(md).toContain("```\nconst x = 1;\n```");
    expect(md).toContain("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(md).not.toContain("menu");
    expect(md).not.toContain("alert");
    expect(extractTitle(html)).toBe("Spec & notes");
  });
});

describe("notion", () => {
  it("parses ids from URLs and converts blocks", () => {
    expect(notionPageId("https://www.notion.so/acme/Scope-0123456789abcdef0123456789abcdef?pvs=4")).toBe("01234567-89ab-cdef-0123-456789abcdef");
    expect(notionPageId("nope")).toBeNull();
    const md = notionBlocksToMarkdown([
      { id: "1", type: "heading_1", heading_1: { rich_text: [{ plain_text: "Title" }] } },
      { id: "2", type: "paragraph", paragraph: { rich_text: [{ plain_text: "bold", annotations: { bold: true } }, { plain_text: " link", href: "https://x" }] } },
      { id: "3", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "item" }] }, children: [{ id: "4", type: "bulleted_list_item", bulleted_list_item: { rich_text: [{ plain_text: "nested" }] } }] },
      { id: "5", type: "to_do", to_do: { rich_text: [{ plain_text: "done" }], checked: true } },
      { id: "6", type: "code", code: { rich_text: [{ plain_text: "x=1" }], language: "python" } },
    ]);
    expect(md).toContain("# Title");
    expect(md).toContain("**bold**[ link](https://x)");
    expect(md).toContain("- item\n  - nested");
    expect(md).toContain("- [x] done");
    expect(md).toContain("```python\nx=1\n```");
  });
});

describe("refs", () => {
  it("parses confluence and google refs and blocks private URLs", () => {
    expect(confluencePageRef("https://acme.atlassian.net/wiki/spaces/ENG/pages/123456/Title")).toEqual({ base: "https://acme.atlassian.net/wiki", pageId: "123456" });
    expect(confluencePageRef("123", "https://acme.atlassian.net/wiki/")).toEqual({ base: "https://acme.atlassian.net/wiki", pageId: "123" });
    expect(confluencePageRef("123")).toBeNull();
    expect(googleDocId("https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit")).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz");
    expect(isSafePublicUrl("https://example.com/page")).toBe(true);
    expect(isSafePublicUrl("http://localhost:3000")).toBe(false);
    expect(isSafePublicUrl("http://192.168.1.1/")).toBe(false);
    expect(isSafePublicUrl("http://169.254.169.254/latest")).toBe(false);
    expect(isSafePublicUrl("ftp://example.com")).toBe(false);
  });
});

describe("CLAUDE.md", () => {
  const managed = renderManagedSection({ orgName: "Amine Co", workspaceName: "Acme", clientName: "Acme Inc.", globalRules: "Use TS.", guardrails: "No prod.", workspaceRules: "Run tests.", docs: [{ title: "Scope", kind: "scope", content: "Phase 1" }], towerUrl: "https://tower.example.com" });
  it("renders a marked section", () => {
    expect(managed.startsWith(START)).toBe(true);
    expect(managed.endsWith(END)).toBe(true);
    expect(managed).toContain("## Guardrails\n\nNo prod.");
    expect(managed).toContain("## Scope (scope)");
  });
  it("appends when absent, replaces between markers, preserves outside content, and is idempotent", () => {
    expect(mergeManagedSection(null, managed).changed).toBe(true);
    const existing = `# My repo notes\n\nKeep this.\n\n${START}\nold\n${END}\n\nAnd this.\n`;
    const merged = mergeManagedSection(existing, managed);
    expect(merged.changed).toBe(true);
    expect(merged.content).toContain("Keep this.");
    expect(merged.content).toContain("And this.");
    expect(merged.content).not.toContain("\nold\n");
    expect(mergeManagedSection(merged.content, managed).changed).toBe(false);
    const appended = mergeManagedSection("# Notes\n", managed);
    expect(appended.content.startsWith("# Notes\n\n")).toBe(true);
    expect(appended.content).toContain(START);
  });
});
