import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";

const GUIDES_DIR = path.join(process.cwd(), "docs", "panduan");

export type GuideSummary = {
  slug: string;
  title: string;
  summary: string;
};

function firstParagraph(markdown: string) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.startsWith("# "));
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    if (line.startsWith("#") || line.startsWith(">") || line.startsWith("|") || line.startsWith("-") || line.startsWith("```")) {
      continue;
    }
    return line.replace(/\*\*/g, "").slice(0, 180);
  }
  return "";
}

export function isGuideSlug(slug: string) {
  return /^\d{2}-[a-z0-9-]+$/.test(slug);
}

export async function listGuides(): Promise<GuideSummary[]> {
  const entries = await readdir(GUIDES_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
    .map((entry) => entry.name)
    .sort();

  return Promise.all(files.map(async (file) => {
    const markdown = await readFile(path.join(GUIDES_DIR, file), "utf8");
    const title = markdown.split("\n").find((line) => line.startsWith("# "))?.replace(/^#\s+/, "") ?? file;
    return {
      slug: file.replace(/\.md$/, ""),
      title,
      summary: firstParagraph(markdown),
    };
  }));
}

function rewriteMarkdownLinks(html: string) {
  return html.replace(/href="([^"]+)"/g, (match, href: string) => {
    if (/^(https?:|mailto:|#)/i.test(href)) return match;
    const [rawPath, hash] = href.split("#");
    if (!rawPath.toLowerCase().endsWith(".md")) return match;
    const base = rawPath.split("/").pop()?.replace(/\.md$/i, "") ?? "";
    if (base.toLowerCase() === "readme") return `href="/docs${hash ? `#${hash}` : ""}"`;
    return `href="/docs/${base}${hash ? `#${hash}` : ""}"`;
  });
}

export async function readGuide(slug: string): Promise<{ title: string; html: string } | null> {
  if (!isGuideSlug(slug)) return null;
  try {
    const markdown = await readFile(path.join(GUIDES_DIR, `${slug}.md`), "utf8");
    const title = markdown.split("\n").find((line) => line.startsWith("# "))?.replace(/^#\s+/, "") ?? slug;
    const html = rewriteMarkdownLinks(await marked.parse(markdown, { gfm: true }));
    return { title, html };
  } catch {
    return null;
  }
}
