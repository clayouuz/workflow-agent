import { relative, resolve, sep } from "node:path";
import { readText } from "./fs.ts";
import { extractMarkdownSection } from "./markdown.ts";
import { WORKSPACE, activeLedgerDir } from "./workspace.ts";

export interface LoadedReference {
  reference: string;
  content: string;
  characters: number;
  estimatedTokens: number;
}

export async function loadReference(reference: string): Promise<LoadedReference> {
  const { pathPart, fragment } = splitReference(reference);
  const root = pathPart.startsWith("ledger/") ? activeLedgerDir() : WORKSPACE;
  const relativePath = pathPart.startsWith("ledger/") ? pathPart.slice("ledger/".length) : pathPart;
  const target = resolve(root, relativePath);
  ensureInsideWorkspace(target);
  const source = await readText(target);
  const content = fragment ? extractMarkdownSection(source, fragment) : source;
  return {
    reference,
    content,
    characters: [...content].length,
    estimatedTokens: estimateTokens(content),
  };
}

export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const character of text) {
    if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(character)) cjk++;
    else if (!/\s/u.test(character)) other++;
  }
  return cjk + Math.ceil(other / 4);
}

function splitReference(reference: string): { pathPart: string; fragment?: string } {
  const hash = reference.indexOf("#");
  if (hash < 0) return { pathPart: reference };
  const pathPart = reference.slice(0, hash);
  const fragment = reference.slice(hash + 1);
  if (!pathPart || !fragment) throw new Error(`非法上下文引用: ${reference}`);
  return { pathPart, fragment };
}

function ensureInsideWorkspace(target: string): void {
  const rel = relative(resolve(WORKSPACE), target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || resolve(rel) === resolve(target)) {
    throw new Error(`上下文引用超出工作区: ${target}`);
  }
}

