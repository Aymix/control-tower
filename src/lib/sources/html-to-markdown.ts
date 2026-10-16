/**
 * Small, dependency-free HTML → markdown converter good enough for KB snapshots
 * (headings, paragraphs, lists, links, code, tables, images as alt text).
 * Not a full parser: it works on a tag stream and ignores scripts/styles/nav.
 */

const BLOCK_DROP = ["script", "style", "noscript", "svg", "canvas", "iframe", "template", "nav", "footer", "header", "form", "button"];

export function htmlToMarkdown(html: string, opts: { baseUrl?: string } = {}): string {
  let s = html;
  for (const tag of BLOCK_DROP) s = s.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  const main = /<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(s);
  if (main && main[2].replace(/<[^>]+>/g, "").trim().length > 200) s = main[2];
  s = s.replace(/<pre\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, c) => `\n\n\`\`\`\n${decode(stripTags(c))}\n\`\`\`\n\n`);
  s = s.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_, c) => `\n\n\`\`\`\n${decode(stripTags(c))}\n\`\`\`\n\n`);
  s = s.replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, (_, c) => `\`${decode(stripTags(c))}\``);
  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, n, c) => `\n\n${"#".repeat(Number(n))} ${inline(c, opts)}\n\n`);
  s = s.replace(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, body) => {
    let i = 0;
    const items = [...body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => {
      const t = inline(m[1], opts).replace(/\n+/g, " ").trim();
      i++;
      return tag.toLowerCase() === "ol" ? `${i}. ${t}` : `- ${t}`;
    });
    return `\n\n${items.join("\n")}\n\n`;
  });
  s = s.replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, body) => {
    const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => inline(c[1], opts).replace(/\n+/g, " ").trim()));
    if (!rows.length) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
    return `\n\n${line(rows[0])}\n| ${Array.from({ length: width }, () => "---").join(" | ")} |\n${rows.slice(1).map(line).join("\n")}\n\n`;
  });
  s = s.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, c) => `\n\n> ${inline(c, opts).replace(/\n+/g, "\n> ")}\n\n`);
  s = s.replace(/<(p|div|section|br|hr|tr|dd|dt|figcaption)\b[^>]*\/?>/gi, (m) => (/^<br/i.test(m) ? "\n" : /^<hr/i.test(m) ? "\n\n---\n\n" : "\n\n"));
  s = inline(s, opts);
  return s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s+|\s+$/g, "")
    .replace(/[ \t]{2,}/g, " ");
}

function inline(html: string, opts: { baseUrl?: string }): string {
  let s = html;
  s = s.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const t = stripTags(text).trim();
    const url = resolve(href, opts.baseUrl);
    return t && url && !url.startsWith("#") && !url.startsWith("javascript:") ? `[${t}](${url})` : t;
  });
  s = s.replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/gi, (_, alt) => (alt ? `[image: ${alt}]` : ""));
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, c) => `**${stripTags(c).trim()}**`);
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, __, c) => `*${stripTags(c).trim()}*`);
  return decode(stripTags(s));
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function resolve(href: string, base?: string): string {
  try {
    return base ? new URL(href, base).toString() : href;
  } catch {
    return href;
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
export function decode(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Title from <title> or the first h1. */
export function extractTitle(html: string): string | null {
  const t = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  return t ? decode(stripTags(t)).replace(/\s+/g, " ").trim().slice(0, 200) || null : null;
}
