import { readdir } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { WORKSPACE } from "./workspace.ts";

export interface CaseResult {
  name: string;
  ok: boolean;
  error?: string;
}

export interface FileResult {
  file: string;
  cases: CaseResult[];
}

export async function discoverTestFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await discoverTestFiles(full)));
    } else if (entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

export async function runFile(file: string): Promise<FileResult> {
  const url = pathToFileURL(resolve(file)).href;
  let mod: Record<string, unknown>;
  try {
    mod = (await import(url)) as Record<string, unknown>;
  } catch (err) {
    return {
      file,
      cases: [
        {
          name: "(import)",
          ok: false,
          error: err instanceof Error ? (err.stack ?? err.message) : String(err),
        },
      ],
    };
  }
  const cases: CaseResult[] = [];
  for (const key of Object.keys(mod)) {
    if (!key.startsWith("test_")) continue;
    const fn = mod[key];
    if (typeof fn !== "function") continue;
    try {
      await (fn as () => unknown)();
      cases.push({ name: key, ok: true });
    } catch (err) {
      cases.push({
        name: key,
        ok: false,
        error: err instanceof Error ? (err.stack ?? err.message) : String(err),
      });
    }
  }
  return { file, cases };
}

export interface RunSummary {
  startedAt: string;
  completedAt: string;
  files: FileResult[];
  total: number;
  passed: number;
  failed: number;
  emptyFiles: string[];
  interrupted: boolean;
}

const cleanupHooks = new Set<() => Promise<void> | void>();

export function registerTestCleanup(cleanup: () => Promise<void> | void): void {
  cleanupHooks.add(cleanup);
}

async function cleanupTestResources(): Promise<void> {
  for (const cleanup of cleanupHooks) await cleanup();
}

/**
 * 运行一组测试文件并打印结果。返回 { total, failed }。
 */
export async function runFiles(files: string[]): Promise<RunSummary> {
  const startedAt = new Date().toISOString();
  let total = 0;
  let failed = 0;
  const fileResults: FileResult[] = [];
  const emptyFiles: string[] = [];
  for (const file of files) {
    const rel = relative(WORKSPACE, file);
    const result = await runFile(file);
    fileResults.push(result);
    if (result.cases.length === 0) {
      console.log(`- ${rel}: 无 test_ 开头的用例`);
      emptyFiles.push(file);
      continue;
    }
    for (const c of result.cases) {
      total++;
      if (c.ok) {
        console.log(`  ✓ ${rel} :: ${c.name}`);
      } else {
        failed++;
        console.log(`  ✗ ${rel} :: ${c.name}`);
        if (c.error) {
          for (const line of c.error.split(/\r?\n/).slice(0, 6)) {
            console.log(`      ${line}`);
          }
        }
      }
    }
  }
  const summary = {
    startedAt,
    completedAt: new Date().toISOString(),
    files: fileResults,
    total,
    passed: total - failed,
    failed,
    emptyFiles,
    interrupted: false,
  };
  await cleanupTestResources();
  return summary;
}
