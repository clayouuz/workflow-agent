import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { TestConfig } from "./test-config.ts";

export interface ContentFingerprint {
  algorithm: "sha256";
  digest: string;
  files: string[];
}

export async function fingerprintTestInputs(config: TestConfig): Promise<ContentFingerprint> {
  const files = await collectFiles([...config.sourceRoots, ...config.testRoots], config.exclude);
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return { algorithm: "sha256", digest: hash.digest("hex"), files };
}

export async function hashText(text: string): Promise<string> {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function collectFiles(roots: string[], exclude: string[]): Promise<string[]> {
  const found = new Set<string>();
  for (const root of roots) await walk(resolve(root), exclude, found);
  return [...found].sort((a, b) => a.localeCompare(b));
}

async function walk(path: string, exclude: string[], found: Set<string>): Promise<void> {
  if (exclude.some((part) => path.includes(part))) return;
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) await walk(full, exclude, found);
    else if (entry.isFile() && /\.(?:ts|tsx|js|jsx)$/i.test(entry.name)) found.add(full);
  }
}
