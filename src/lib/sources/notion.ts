/** Converts Notion API blocks (version 2022-06-28) into markdown. Pure; the fetcher lives in the server module. */

export type NotionRichText = { plain_text: string; href?: string | null; annotations?: { bold?: boolean; italic?: boolean; code?: boolean; strikethrough?: boolean } };
export type NotionBlock = { id: string; type: string; has_children?: boolean; children?: NotionBlock[]; [key: string]: unknown };

function rt(parts: NotionRichText[] | undefined): string {
  return (parts ?? [])
    .map((p) => {
      let t = p.plain_text ?? "";
      if (p.annotations?.code) t = `\`${t}\``;
      if (p.annotations?.bold) t = `**${t}**`;
      if (p.annotations?.italic) t = `*${t}*`;
      if (p.annotations?.strikethrough) t = `~~${t}~~`;
      if (p.href) t = `[${t}](${p.href})`;
      return t;
    })
    .join("");
}

export function notionBlocksToMarkdown(blocks: NotionBlock[], depth = 0): string {
  const out: string[] = [];
  let num = 0;
  for (const b of blocks) {
    const data = (b[b.type] ?? {}) as { rich_text?: NotionRichText[]; language?: string; checked?: boolean; url?: string; external?: { url: string }; file?: { url: string }; caption?: NotionRichText[]; title?: string; expression?: string };
    const text = rt(data.rich_text);
    const pad = "  ".repeat(depth);
    const nested = b.type.endsWith("list_item") || b.type === "to_do" || b.type === "toggle";
    const children = b.children?.length ? "\n" + notionBlocksToMarkdown(b.children, nested ? depth + 1 : depth) : "";
    if (b.type !== "numbered_list_item") num = 0;
    switch (b.type) {
      case "paragraph":
        if (text.trim()) out.push(`${pad}${text}${children}`);
        else if (children) out.push(children.trim());
        break;
      case "heading_1":
        out.push(`# ${text}`);
        break;
      case "heading_2":
        out.push(`## ${text}`);
        break;
      case "heading_3":
        out.push(`### ${text}`);
        break;
      case "bulleted_list_item":
      case "toggle":
        out.push(`${pad}- ${text}${children}`);
        break;
      case "numbered_list_item":
        num++;
        out.push(`${pad}${num}. ${text}${children}`);
        break;
      case "to_do":
        out.push(`${pad}- [${data.checked ? "x" : " "}] ${text}${children}`);
        break;
      case "quote":
        out.push(`> ${text.replace(/\n/g, "\n> ")}${children}`);
        break;
      case "callout":
        out.push(`> **Note:** ${text}${children}`);
        break;
      case "code":
        out.push(`\`\`\`${data.language ?? ""}\n${(data.rich_text ?? []).map((p) => p.plain_text).join("")}\n\`\`\``);
        break;
      case "divider":
        out.push("---");
        break;
      case "image":
      case "file":
      case "pdf":
      case "video":
      case "embed":
      case "bookmark": {
        const url = data.url ?? data.external?.url ?? data.file?.url ?? "";
        const cap = rt(data.caption);
        out.push(`[${b.type}${cap ? `: ${cap}` : ""}](${url})`);
        break;
      }
      case "equation":
        out.push(`$$${data.expression ?? ""}$$`);
        break;
      case "table": {
        const rows = (b.children ?? []).map((r) => ((r.table_row as { cells?: NotionRichText[][] })?.cells ?? []).map((c) => rt(c)));
        if (rows.length) {
          const width = Math.max(...rows.map((r) => r.length));
          const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? "").join(" | ")} |`;
          out.push(`${line(rows[0])}\n| ${Array.from({ length: width }, () => "---").join(" | ")} |\n${rows.slice(1).map(line).join("\n")}`);
        }
        break;
      }
      case "child_page":
        out.push(`**Sub-page:** ${data.title ?? ""}`);
        break;
      case "child_database":
        out.push(`**Database:** ${data.title ?? ""}`);
        break;
      case "column_list":
      case "column":
      case "synced_block":
        if (children) out.push(children.trim());
        break;
      default:
        if (text.trim()) out.push(text);
        else if (children) out.push(children.trim());
    }
  }
  return out.join("\n\n").replace(/\n{3,}/g, "\n\n");
}

/** Accepts a Notion page URL or a raw id and returns the dashed UUID. */
export function notionPageId(ref: string): string | null {
  const flat = ref.trim().replace(/-/g, "");
  const m = /([0-9a-f]{32})(?:[?#/]|$)/i.exec(flat) ?? /([0-9a-f]{32})/i.exec(flat);
  if (!m) return null;
  const h = m[1].toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
