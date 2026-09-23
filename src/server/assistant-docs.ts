import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { assistantDocAllowed, type AssistantAudience } from "@/src/lib/assistant-access";

export type AssistantDocMeta = {
  id: string;
  title: string;
  path: string;
};

const KNOWLEDGE_DIR = "docs/knowledge";
const EXTRA_DOCS: AssistantDocMeta[] = [
  { id: "class-rules-2026-27", title: "Class rules 2026–27", path: "docs/class-rules-2026-27.md" },
  { id: "nas-storage", title: "NAS / Drive storage", path: "docs/NAS-STORAGE.md" },
  { id: "subdomains", title: "Hosts and subdomains", path: "docs/SUBDOMAINS.md" }
];

const MAX_DOC_CHARS = 14_000;
const MAX_SEARCH_HITS = 8;
const SNIPPET_CHARS = 280;

function repoPath(...parts: string[]) {
  return path.join(process.cwd(), ...parts);
}

function titleFromMarkdown(id: string, markdown: string) {
  const heading = markdown.match(/^#\s+(.+)$/m);
  return heading?.[1]?.trim() || id;
}

function listKnowledgeFiles() {
  const dir = repoPath(KNOWLEDGE_DIR);
  const entries = readdirSync(dir);
  const docs: AssistantDocMeta[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".md")) {
      continue;
    }
    const relative = `${KNOWLEDGE_DIR}/${entry}`;
    const absolute = repoPath(relative);
    if (!statSync(absolute).isFile()) {
      continue;
    }
    const id = entry.replace(/\.md$/i, "");
    const markdown = readFileSync(absolute, "utf8");
    docs.push({
      id,
      title: titleFromMarkdown(id, markdown),
      path: relative
    });
  }

  return docs.sort((a, b) => a.id.localeCompare(b.id));
}

export function listAssistantDocs(audience: AssistantAudience = "executive"): AssistantDocMeta[] {
  const docs = [...listKnowledgeFiles(), ...EXTRA_DOCS];
  return docs.filter((doc) => assistantDocAllowed(doc.id, audience));
}

export function resolveAssistantDoc(id: string, audience: AssistantAudience = "executive") {
  const normalized = id.trim().toLowerCase();
  if (!normalized || normalized.includes("..") || normalized.includes("/") || normalized.includes("\\")) {
    return null;
  }

  const match = listAssistantDocs(audience).find((doc) => doc.id.toLowerCase() === normalized);
  if (!match) {
    return null;
  }

  const absolute = repoPath(match.path);
  const docsRoot = repoPath("docs");
  if (!absolute.startsWith(docsRoot + path.sep) && absolute !== docsRoot) {
    return null;
  }

  return match;
}

export function readAssistantDoc(id: string, audience: AssistantAudience = "executive") {
  const meta = resolveAssistantDoc(id, audience);
  if (!meta) {
    return null;
  }

  const markdown = readFileSync(repoPath(meta.path), "utf8").trim();
  const truncated = markdown.length > MAX_DOC_CHARS;
  return {
    id: meta.id,
    title: meta.title,
    path: meta.path,
    truncated,
    content: truncated ? `${markdown.slice(0, MAX_DOC_CHARS)}\n\n[Truncated]` : markdown
  };
}

function snippetAround(haystack: string, index: number) {
  const start = Math.max(0, index - 80);
  const end = Math.min(haystack.length, index + SNIPPET_CHARS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < haystack.length ? "…" : "";
  return `${prefix}${haystack.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

export function searchAssistantDocs(query: string, audience: AssistantAudience = "executive") {
  const terms = query
    .toLowerCase()
    .split(/\s+/g)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);

  if (terms.length === 0) {
    return [];
  }

  const hits: Array<{ id: string; title: string; snippet: string; score: number }> = [];

  for (const meta of listAssistantDocs(audience)) {
    const markdown = readFileSync(repoPath(meta.path), "utf8");
    const lower = markdown.toLowerCase();
    let score = 0;
    let firstIndex = -1;
    for (const term of terms) {
      const index = lower.indexOf(term);
      if (index === -1) {
        continue;
      }
      score += 1;
      if (firstIndex === -1 || index < firstIndex) {
        firstIndex = index;
      }
    }
    if (score === 0 || firstIndex === -1) {
      continue;
    }
    hits.push({
      id: meta.id,
      title: meta.title,
      snippet: snippetAround(markdown, firstIndex),
      score
    });
  }

  return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, MAX_SEARCH_HITS);
}

export function runAssistantDocTool(
  name: string,
  rawArgs: unknown,
  audience: AssistantAudience = "executive"
) {
  const args = rawArgs && typeof rawArgs === "object" ? (rawArgs as Record<string, unknown>) : {};

  if (name === "list_docs") {
    return {
      docs: listAssistantDocs(audience).map((doc) => ({ id: doc.id, title: doc.title }))
    };
  }

  if (name === "read_doc") {
    const id = typeof args.id === "string" ? args.id : "";
    const doc = readAssistantDoc(id, audience);
    if (!doc) {
      return { error: "Unknown doc id. Call list_docs first." };
    }
    return doc;
  }

  if (name === "search_docs") {
    const query = typeof args.query === "string" ? args.query : "";
    return { hits: searchAssistantDocs(query, audience) };
  }

  return { error: `Unknown tool: ${name}` };
}

export const ASSISTANT_DOC_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_docs",
      description: "List Portal product knowledge docs you can read. Call this first when you are unsure which file to open.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "search_docs",
      description: "Keyword search across Portal knowledge docs. Returns matching doc ids and short snippets.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search words, e.g. publishing queue or stage 3"
          }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "read_doc",
      description: "Read one Portal knowledge doc by id from list_docs or search_docs.",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Doc id, e.g. groups-and-review or accounts-and-admin"
          }
        },
        required: ["id"],
        additionalProperties: false
      }
    }
  }
];
