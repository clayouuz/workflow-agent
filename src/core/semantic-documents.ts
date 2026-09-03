import { relative, resolve, sep } from "node:path";
import { readText } from "./fs.ts";
import { hashText } from "./hash.ts";
import { activeLedgerDir } from "./workspace.ts";

export interface SemanticAcceptance {
  id: string;
  mode: "auto" | "manual";
  description: string;
}

export interface BenchmarkContract {
  id: string;
  title: string;
  reference: string;
  digest: string;
  content: string;
  acceptance: SemanticAcceptance[];
  ready: boolean;
}

export interface WorkItemDocument {
  id: string;
  title: string;
  reference: string;
  digest: string;
  content: string;
}

export async function readBenchmarkContract(id: string, reference = `ledger/benchmarks/${id}.md`): Promise<BenchmarkContract> {
  const { path, normalized } = semanticPath(reference, `benchmarks/${id}.md`);
  const content = await readText(path);
  const title = firstTitle(content, id);
  const acceptance = section(content, "Acceptance").split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^[-*]\s+(\S+)\s+\[(auto|manual)\]\s+(.+)$/i);
    return match ? [{ id: match[1], mode: match[2].toLowerCase() as "auto" | "manual", description: match[3].trim() }] : [];
  });
  const required = ["Environment", "Entry", "Fixture", "Action", "Oracle", "Acceptance", "Exclusions"];
  return {
    id,
    title,
    reference: `ledger/${normalized}`,
    digest: await hashText(content),
    content,
    acceptance,
    ready: required.every((name) => section(content, name).trim()) && acceptance.length > 0,
  };
}

export async function readWorkItemDocument(id: string, reference = `ledger/work-items/${id}.md`): Promise<WorkItemDocument> {
  const { path, normalized } = semanticPath(reference, `work-items/${id}.md`);
  const content = await readText(path);
  return { id, title: firstTitle(content, id), reference: `ledger/${normalized}`, digest: await hashText(content), content };
}

function semanticPath(reference: string, expected: string): { path: string; normalized: string } {
  const normalized = reference.replaceAll("\\", "/").replace(/^ledger\//, "");
  if (normalized !== expected) throw new Error(`语义文档必须位于 ledger/${expected}`);
  const root = resolve(activeLedgerDir());
  const path = resolve(root, ...normalized.split("/"));
  const rel = relative(root, path);
  if (rel === ".." || rel.startsWith(`..${sep}`)) throw new Error(`语义文档路径越界: ${reference}`);
  return { path, normalized };
}

function firstTitle(content: string, fallback: string): string {
  const title = content.match(/^#\s+(.+)$/m)?.[1].trim() || fallback;
  return title.replace(new RegExp(`^${escapeRegex(fallback)}\\s+`, "i"), "");
}

function section(content: string, name: string): string {
  return content.match(new RegExp(`(?:^|\\n)##\\s+${escapeRegex(name)}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "i"))?.[1] ?? "";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
