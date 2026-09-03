import { readdir, readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { exists, readJson, writeText } from "./fs.ts";
import { PATHS } from "./workspace.ts";
import type { TestConfig } from "./test-config.ts";

export interface FuncInfo {
  id: string;
  name: string;
  file: string;
  kind: string;
  startLine: number;
}

export interface CallEdge {
  caller: string;
  calleeName: string;
}

export interface CallGraph {
  builtAt: string;
  sourceRoots: string[];
  testRoots: string[];
  functions: FuncInfo[];
  calls: CallEdge[];
}

function graphPath(): string {
  return join(PATHS.tests, "callgraph.json");
}

async function loadTs(): Promise<typeof import("typescript")> {
  let mod: unknown;
  try {
    mod = await import("typescript");
  } catch {
    throw new Error("缺少 typescript 依赖，请先在项目根目录执行: npm install");
  }
  const ns = mod as { default?: unknown };
  return (ns.default ?? mod) as typeof import("typescript");
}

async function collectTsFiles(root: string, exclude: string[]): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        await walk(full);
      } else if (entry.name.endsWith(".ts") && !isExcluded(full, exclude)) {
        out.push(resolve(full));
      }
    }
  }
  await walk(root);
  return out;
}

function isExcluded(file: string, exclude: string[]): boolean {
  return exclude.some((ex) => file.includes(ex));
}

function getCalleeName(ts: typeof import("typescript"), node: import("typescript").CallExpression): string | null {
  const expr = node.expression;
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return null;
}

function parseSourceFile(
  ts: typeof import("typescript"),
  file: string,
  text: string,
  out: { functions: FuncInfo[]; calls: CallEdge[] },
): void {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let counter = 0;
  const stack: string[] = [];

  function push(name: string, node: import("typescript").Node): string {
    const id = `${file}#${name}#${counter++}`;
    out.functions.push({
      id,
      name,
      file,
      kind: "function",
      startLine: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
    });
    return id;
  }

  function visit(node: import("typescript").Node): void {
    switch (node.kind) {
      case ts.SyntaxKind.FunctionDeclaration: {
        const fd = node as import("typescript").FunctionDeclaration;
        const name = fd.name?.text ?? "(anonymous)";
        const id = push(name, fd);
        stack.push(id);
        ts.forEachChild(node, visit);
        stack.pop();
        return;
      }
      case ts.SyntaxKind.MethodDeclaration: {
        const md = node as import("typescript").MethodDeclaration;
        const name = ts.isIdentifier(md.name) ? md.name.text : "(method)";
        const id = push(name, md);
        stack.push(id);
        ts.forEachChild(node, visit);
        stack.pop();
        return;
      }
      case ts.SyntaxKind.Constructor: {
        const id = push("constructor", node);
        stack.push(id);
        ts.forEachChild(node, visit);
        stack.pop();
        return;
      }
      case ts.SyntaxKind.VariableDeclaration: {
        const vd = node as import("typescript").VariableDeclaration;
        if (vd.initializer && (ts.isArrowFunction(vd.initializer) || ts.isFunctionExpression(vd.initializer))) {
          const name = ts.isIdentifier(vd.name) ? vd.name.text : "(var)";
          const id = push(name, vd);
          stack.push(id);
          ts.forEachChild(node, visit);
          stack.pop();
          return;
        }
        break;
      }
      case ts.SyntaxKind.CallExpression: {
        const ce = node as import("typescript").CallExpression;
        const calleeName = getCalleeName(ts, ce);
        const caller = stack.length > 0 ? stack[stack.length - 1] : null;
        if (caller && calleeName) {
          out.calls.push({ caller, calleeName });
        }
        break;
      }
    }
    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sf, visit);
}

export async function buildGraph(config: TestConfig): Promise<CallGraph> {
  const ts = await loadTs();
  const sourceRoots = config.sourceRoots.map((r) => resolve(r));
  const testRoots = config.testRoots.map((r) => resolve(r));
  if (sourceRoots.length === 0) {
    throw new Error("sourceRoots 为空，请先执行 test config <源码目录> 或编辑 workspace/tests/config.json");
  }

  const files = new Set<string>();
  for (const root of sourceRoots) {
    for (const f of await collectTsFiles(root, config.exclude)) files.add(f);
  }
  for (const root of testRoots) {
    for (const f of await collectTsFiles(root, config.exclude)) files.add(f);
  }

  const functions: FuncInfo[] = [];
  const calls: CallEdge[] = [];
  const out = { functions, calls };
  for (const file of files) {
    const text = await readFile(file, "utf8");
    parseSourceFile(ts, file, text, out);
  }

  const graph: CallGraph = {
    builtAt: new Date().toISOString(),
    sourceRoots,
    testRoots,
    functions,
    calls,
  };
  await writeText(graphPath(), JSON.stringify(graph, null, 2) + "\n");
  return graph;
}

async function loadCachedGraph(): Promise<CallGraph | null> {
  const p = graphPath();
  if (!(await exists(p))) return null;
  try {
    const data = (await readJson(p)) as CallGraph;
    if (!Array.isArray(data.functions) || !Array.isArray(data.calls)) return null;
    return data;
  } catch {
    return null;
  }
}

function isUnderAny(file: string, roots: Set<string>): boolean {
  for (const root of roots) {
    if (file === root || file.startsWith(root + sep)) return true;
  }
  return false;
}

/**
 * 返回覆盖了 changedFiles 的测试文件列表。
 * 算法：函数名匹配的逆向调用闭包（过度近似，保证不漏测）。
 */
export async function impactedTestFiles(config: TestConfig, changedFiles: string[]): Promise<string[]> {
  const normalizedChanged = changedFiles.map((f) => resolve(f));

  let graph = await loadCachedGraph();
  if (graph) {
    const cfgSource = config.sourceRoots.map((r) => resolve(r));
    const rootsChanged =
      graph.sourceRoots.length !== cfgSource.length ||
      !graph.sourceRoots.every((r, i) => r === cfgSource[i]);
    if (rootsChanged) {
      console.log("sourceRoots 配置已变更，重建调用图...");
      graph = null;
    }
  }
  if (graph) {
    const knownFiles = new Set(graph.functions.map((f) => f.file));
    const unknown = normalizedChanged.filter((f) => !knownFiles.has(f));
    if (unknown.length > 0) {
      console.log(`有 ${unknown.length} 个变更文件不在调用图中，重建调用图...`);
      graph = null;
    }
  }
  if (!graph) {
    graph = await buildGraph(config);
  }

  const changedIds = new Set(
    graph.functions.filter((f) => normalizedChanged.includes(f.file)).map((f) => f.id),
  );
  if (changedIds.size === 0) {
    return [];
  }

  const byName = new Map<string, string[]>();
  for (const f of graph.functions) {
    const list = byName.get(f.name);
    if (list) list.push(f.id);
    else byName.set(f.name, [f.id]);
  }

  const affected = new Set(changedIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of graph.calls) {
      if (affected.has(edge.caller)) continue;
      const targets = byName.get(edge.calleeName) ?? [];
      if (targets.some((t) => affected.has(t))) {
        affected.add(edge.caller);
        changed = true;
      }
    }
  }

  const testRootSet = new Set(
    (config.testRoots.length > 0 ? config.testRoots : [PATHS.tests]).map((r) => resolve(r)),
  );
  const testFiles = new Set<string>();
  for (const f of graph.functions) {
    if (affected.has(f.id) && isUnderAny(f.file, testRootSet)) {
      testFiles.add(f.file);
    }
  }
  for (const cf of normalizedChanged) {
    if (cf.endsWith(".test.ts") && isUnderAny(cf, testRootSet)) {
      testFiles.add(cf);
    }
  }
  return [...testFiles];
}
