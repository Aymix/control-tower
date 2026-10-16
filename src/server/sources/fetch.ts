import type { KbSource } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { htmlToMarkdown, extractTitle } from "@/lib/sources/html-to-markdown";
import { notionBlocksToMarkdown, notionPageId, type NotionBlock } from "@/lib/sources/notion";
import { confluencePageRef, googleDocExportUrl, googleDocId, isSafePublicUrl } from "@/lib/sources/refs";

export type Fetched = { title: string | null; markdown: string; sourceUrl: string | null };

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 20_000;

export class SourceFetchError extends Error {}

async function get(url: string, headers: Record<string, string> = {}): Promise<{ text: string; contentType: string }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "user-agent": "control-tower/1.0 (knowledge snapshot)", accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.5", ...headers }, redirect: "follow", signal: ac.signal });
    if (!res.ok) throw new SourceFetchError(`${res.status} ${res.statusText} from ${new URL(url).hostname}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new SourceFetchError("Document is larger than 2 MB.");
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new SourceFetchError("Document is larger than 2 MB.");
    return { text, contentType: res.headers.get("content-type") ?? "" };
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new SourceFetchError("Timed out after 20 s.");
    throw err;
  } finally {
    clearTimeout(t);
  }
}

function secret(src: KbSource): string | null {
  return src.secretEnc ? decryptSecret(src.secretEnc, env().MASTER_KEY) : null;
}

export async function fetchSource(src: KbSource): Promise<Fetched> {
  switch (src.kind) {
    case "url": {
      if (!isSafePublicUrl(src.ref)) throw new SourceFetchError("Only public http(s) URLs are allowed.");
      const { text, contentType } = await get(src.ref);
      if (/json/.test(contentType)) return { title: null, markdown: "```json\n" + text.slice(0, 200_000) + "\n```", sourceUrl: src.ref };
      if (/text\/plain|markdown/.test(contentType)) return { title: null, markdown: text, sourceUrl: src.ref };
      return { title: extractTitle(text), markdown: htmlToMarkdown(text, { baseUrl: src.ref }), sourceUrl: src.ref };
    }
    case "google_doc": {
      const id = googleDocId(src.ref);
      if (!id) throw new SourceFetchError("Not a Google Doc URL or id.");
      const { text, contentType } = await get(googleDocExportUrl(id));
      if (/text\/html/.test(contentType)) throw new SourceFetchError("Google returned a sign-in page. Share the document as “Anyone with the link can view”.");
      return { title: null, markdown: text.replace(/\r\n/g, "\n").trim(), sourceUrl: `https://docs.google.com/document/d/${id}/edit` };
    }
    case "notion": {
      const token = secret(src);
      if (!token) throw new SourceFetchError("Add a Notion integration token (and share the page with the integration).");
      const pageId = notionPageId(src.ref);
      if (!pageId) throw new SourceFetchError("Not a Notion page URL or id.");
      const headers = { authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" };
      const page = JSON.parse((await get(`https://api.notion.com/v1/pages/${pageId}`, headers)).text) as { properties?: Record<string, { type: string; title?: { plain_text: string }[] }>; url?: string };
      const titleProp = Object.values(page.properties ?? {}).find((p) => p.type === "title");
      const title = titleProp?.title?.map((t) => t.plain_text).join("") || null;
      const blocks = await notionChildren(pageId, headers, 0);
      return { title, markdown: notionBlocksToMarkdown(blocks), sourceUrl: page.url ?? src.ref };
    }
    case "confluence": {
      const token = secret(src);
      const email = src.config.email;
      const ref = confluencePageRef(src.ref, src.config.base);
      if (!ref) throw new SourceFetchError("Not a Confluence page URL (…/pages/<id>/…), or set the site base in the source settings.");
      if (!token || !email) throw new SourceFetchError("Add your Atlassian email and an API token.");
      const auth = "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
      const { text } = await get(`${ref.base}/api/v2/pages/${ref.pageId}?body-format=storage`, { authorization: auth, accept: "application/json" });
      const page = JSON.parse(text) as { title?: string; body?: { storage?: { value?: string } }; _links?: { webui?: string } };
      const html = page.body?.storage?.value ?? "";
      return { title: page.title ?? null, markdown: htmlToMarkdown(html, { baseUrl: ref.base }), sourceUrl: page._links?.webui ? `${ref.base}${page._links.webui}` : src.ref };
    }
  }
}

async function notionChildren(blockId: string, headers: Record<string, string>, depth: number): Promise<NotionBlock[]> {
  if (depth > 4) return [];
  const out: NotionBlock[] = [];
  let cursor: string | undefined;
  do {
    const url = `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`;
    const res = JSON.parse((await get(url, headers)).text) as { results: NotionBlock[]; has_more: boolean; next_cursor?: string };
    for (const b of res.results) {
      if (b.has_children && b.type !== "child_page" && b.type !== "child_database") b.children = await notionChildren(b.id, headers, depth + 1);
      out.push(b);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return out;
}
