// Bundles the assistant's markdown into one JSON module so the server never reads docs from disk
// (a Cloudflare Worker has no project files). Runs on install, dev and build.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const KNOWLEDGE_DIR = "docs/knowledge";
const EXTRA_DOCS = ["docs/class-rules-2026-27.md", "docs/NAS-STORAGE.md", "docs/SUBDOMAINS.md"];

const knowledge = readdirSync(path.join(root, KNOWLEDGE_DIR))
  .filter((entry) => entry.endsWith(".md"))
  .map((entry) => `${KNOWLEDGE_DIR}/${entry}`);
const files = [...knowledge, ...EXTRA_DOCS].filter((relative) => statSync(path.join(root, relative)).isFile()).sort();
const docs = Object.fromEntries(files.map((relative) => [relative, readFileSync(path.join(root, relative), "utf8")]));

mkdirSync(path.join(root, "src/generated"), { recursive: true });
writeFileSync(path.join(root, "src/generated/assistant-docs.json"), `${JSON.stringify(docs)}\n`);
