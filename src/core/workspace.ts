import { join, resolve } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";

/** 工作区根目录：默认跟随当前工作目录（cwd/.workflow），可用环境变量 WORKFLOW_WORKSPACE 覆盖 */
export const WORKSPACE = process.env.WORKFLOW_WORKSPACE
  ? resolve(process.env.WORKFLOW_WORKSPACE)
  : join(process.cwd(), ".workflow");

export const DEFAULT_TASK_ID = "T1-默认";

export function tasksRoot(): string {
  return join(WORKSPACE, "tasks");
}

export function activeTaskFile(): string {
  return join(tasksRoot(), "active.txt");
}

/** 读取当前绑定任务 id；无绑定或文件缺失时回退到默认任务 */
export function readActiveTaskId(): string {
  try {
    const s = readFileSync(activeTaskFile(), "utf8").trim();
    if (s) return s;
  } catch {
    // ignore
  }
  return DEFAULT_TASK_ID;
}

export function writeActiveTaskId(id: string): void {
  mkdirSync(tasksRoot(), { recursive: true });
  writeFileSync(activeTaskFile(), id + "\n", "utf8");
}

export function taskLedgerDir(taskId: string): string {
  return join(tasksRoot(), taskId, "ledger");
}

/** 当前任务台账目录（所有 ledger 命令的读写目标） */
export function activeLedgerDir(): string {
  return taskLedgerDir(readActiveTaskId());
}

/** 列出全部任务 id（按名称排序） */
export function listTaskIds(): string[] {
  try {
    return readdirSync(tasksRoot(), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

export function taskExists(id: string): boolean {
  return existsSync(taskLedgerDir(id));
}

export const PATHS = {
  discussion: join(WORKSPACE, "discussion"),
  workflow: join(WORKSPACE, "discussion", "workflow.md"),
  context: join(WORKSPACE, "discussion", "context.md"),

  heuristics: join(WORKSPACE, "heuristics"),
  strategy: join(WORKSPACE, "heuristics", "strategy.md"),
  learnings: join(WORKSPACE, "heuristics", "learnings.md"),
  heuristicsArchive: join(WORKSPACE, "heuristics", "archive"),

  knowledge: join(WORKSPACE, "knowledge"),
  knowledgeIndex: join(WORKSPACE, "knowledge", "index.md"),
  knowledgeAudit: join(WORKSPACE, "knowledge", "audit.md"),

  get ledger() {
    return activeLedgerDir();
  },
  get authority() {
    return join(activeLedgerDir(), "authority.md");
  },
  get benchmarks() {
    return join(activeLedgerDir(), "benchmarks.md");
  },
  get current() {
    return join(activeLedgerDir(), "current.md");
  },
  get audit() {
    return join(activeLedgerDir(), "audit.md");
  },
  get loads() {
    return join(activeLedgerDir(), "loads.md");
  },
  get raw() {
    return join(activeLedgerDir(), "raw");
  },
  get history() {
    return join(activeLedgerDir(), "history");
  },
  get snapshots() {
    return join(activeLedgerDir(), "snapshots");
  },
  get designs() {
    return join(activeLedgerDir(), "designs");
  },
  get verification() {
    return join(activeLedgerDir(), "verification");
  },
  get operations() {
    return join(activeLedgerDir(), "operations");
  },
  get machineEvents() {
    return join(activeLedgerDir(), "machine-events");
  },
  get benchmarkDocuments() {
    return join(activeLedgerDir(), "benchmarks");
  },
  get workItemDocuments() {
    return join(activeLedgerDir(), "work-items");
  },
  get benchmarkState() {
    return join(activeLedgerDir(), "state", "benchmarks");
  },
  get workItemState() {
    return join(activeLedgerDir(), "state", "work-items");
  },
  get stateSummary() {
    return join(activeLedgerDir(), "state-summary.json");
  },
  get delegationState() {
    return join(activeLedgerDir(), "delegation-state.json");
  },
  get discussionState() {
    return join(activeLedgerDir(), "discussion-state.json");
  },

  tools: join(WORKSPACE, "tools"),
  toolRegistry: join(WORKSPACE, "tools", "registry.md"),
  toolProposals: join(WORKSPACE, "tools", "proposals"),
  toolRequests: join(WORKSPACE, "tools", "requests"),

  tests: join(WORKSPACE, "tests"),
};
