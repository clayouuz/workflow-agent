import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CURRENT_SCHEMA_VERSION = 12;

export type TemplateScope = "shared" | "task";

export interface TemplateEntry {
  relativePath: string;
  sourcePath: string;
  scope: TemplateScope;
  managed: boolean;
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATE_ROOT = join(REPO_ROOT, "templates", `v${CURRENT_SCHEMA_VERSION}`);
// Migration must compare custom files against every published baseline, not only the immediately previous version.
const LEGACY_TEMPLATE_ROOTS: Record<number, string> = {
  1: join(REPO_ROOT, "templates", "v1"),
  2: join(REPO_ROOT, "templates", "v2"),
  3: join(REPO_ROOT, "templates", "v3"),
  4: join(REPO_ROOT, "templates", "v4"),
  5: join(REPO_ROOT, "templates", "v5"),
  6: join(REPO_ROOT, "templates", "v6"),
  7: join(REPO_ROOT, "templates", "v7"),
  8: join(REPO_ROOT, "templates", "v8"),
  9: join(REPO_ROOT, "templates", "v9"),
  10: join(REPO_ROOT, "templates", "v10"),
  11: join(REPO_ROOT, "templates", "v11"),
};

const sharedPaths = [
  "discussion/workflow.md",
  "discussion/delegated-approval.md",
  "discussion/context.md",
  "discussion/operation-log.md",
  "heuristics/strategy.md",
  "heuristics/learnings.md",
  "knowledge/index.md",
  "knowledge/audit.md",
  "tools/ts-test-runner.md",
  "tools/registry.md",
  "tests/config.json",
];

const taskPaths = [
  "ledger/authority.md",
  "ledger/benchmarks.md",
  "ledger/current.md",
  "ledger/audit.md",
  "ledger/loads.md",
  "ledger/history/README.md",
  "ledger/snapshots/README.md",
  "ledger/snapshots/template-draft.json",
  "ledger/raw/README.md",
  "ledger/designs/README.md",
  "ledger/designs/template-general.md",
  "ledger/verification/README.md",
  "ledger/benchmarks/README.md",
  "ledger/work-items/README.md",
  "ledger/state/README.md",
  "ledger/machine-events/README.md",
];

const preV7SharedPaths = sharedPaths.filter((relativePath) => relativePath !== "discussion/operation-log.md");
const preV8TaskPaths = taskPaths.filter((relativePath) => ![
  "ledger/benchmarks/README.md",
  "ledger/work-items/README.md",
  "ledger/state/README.md",
  "ledger/machine-events/README.md",
].includes(relativePath));

const v3SharedPaths = [
  "discussion/workflow.md",
  "discussion/context.md",
  "heuristics/strategy.md",
  "heuristics/learnings.md",
  "knowledge/index.md",
  "knowledge/audit.md",
  "tools/ts-test-runner.md",
  "tools/registry.md",
  "tests/config.json",
];

const v3TaskPaths = [
  "ledger/authority.md",
  "ledger/benchmarks.md",
  "ledger/current.md",
  "ledger/audit.md",
  "ledger/loads.md",
  "ledger/history/README.md",
  "ledger/snapshots/README.md",
  "ledger/snapshots/template-draft.json",
  "ledger/raw/README.md",
  "ledger/designs/README.md",
  "ledger/designs/template-general.md",
  "ledger/verification/README.md",
];

const statefulPaths = new Set([
  "heuristics/learnings.md",
  "knowledge/index.md",
  "knowledge/audit.md",
  "tests/config.json",
  "ledger/authority.md",
  "ledger/benchmarks.md",
  "ledger/current.md",
  "ledger/audit.md",
  "ledger/loads.md",
]);

export const templateRegistry: TemplateEntry[] = [
  ...sharedPaths.map((relativePath) => entry("shared", relativePath)),
  ...taskPaths.map((relativePath) => entry("task", relativePath)),
];

export const legacyManagedTemplateRegistry: TemplateEntry[] = [
  ...[
    "discussion/workflow.md",
    "discussion/rules.md",
    "discussion/context.md",
    "heuristics/strategy.md",
    "tools/ts-test-runner.md",
    "tools/registry.md",
    "tests/smoke.test.ts",
  ].map((relativePath) => legacyEntry("shared", relativePath, 1)),
  ...[
    "ledger/history/README.md",
    "ledger/snapshots/README.md",
    "ledger/snapshots/template.json",
    "ledger/raw/README.md",
    "ledger/designs/README.md",
    "ledger/designs/template-cocos-scene.md",
  ].map((relativePath) => legacyEntry("task", relativePath, 1)),
  ...[
    "discussion/workflow.md",
    "discussion/context.md",
    "heuristics/strategy.md",
    "heuristics/learnings.md",
    "knowledge/index.md",
    "knowledge/audit.md",
    "tools/ts-test-runner.md",
    "tools/registry.md",
    "tests/config.json",
  ].map((relativePath) => legacyEntry("shared", relativePath, 2)),
  ...[
    "ledger/authority.md",
    "ledger/benchmarks.md",
    "ledger/current.md",
    "ledger/audit.md",
    "ledger/loads.md",
    "ledger/history/README.md",
    "ledger/snapshots/README.md",
    "ledger/snapshots/template-draft.json",
    "ledger/raw/README.md",
    "ledger/designs/README.md",
    "ledger/designs/template-general.md",
    "ledger/verification/README.md",
    "ledger/designs/template-cocos-scene.md",
  ].map((relativePath) => legacyEntry("task", relativePath, 2)),
  ...v3SharedPaths.map((relativePath) => legacyEntry("shared", relativePath, 3)),
  ...v3TaskPaths.map((relativePath) => legacyEntry("task", relativePath, 3)),
  ...preV7SharedPaths.map((relativePath) => legacyEntry("shared", relativePath, 4)),
  ...preV8TaskPaths.map((relativePath) => legacyEntry("task", relativePath, 4)),
  ...preV7SharedPaths.map((relativePath) => legacyEntry("shared", relativePath, 5)),
  ...preV8TaskPaths.map((relativePath) => legacyEntry("task", relativePath, 5)),
  ...preV7SharedPaths.map((relativePath) => legacyEntry("shared", relativePath, 6)),
  ...preV8TaskPaths.map((relativePath) => legacyEntry("task", relativePath, 6)),
  ...sharedPaths.map((relativePath) => legacyEntry("shared", relativePath, 7)),
  ...preV8TaskPaths.map((relativePath) => legacyEntry("task", relativePath, 7)),
  ...sharedPaths.map((relativePath) => legacyEntry("shared", relativePath, 8)),
  ...taskPaths.map((relativePath) => legacyEntry("task", relativePath, 8)),
  ...sharedPaths.map((relativePath) => legacyEntry("shared", relativePath, 9)),
  ...taskPaths.map((relativePath) => legacyEntry("task", relativePath, 9)),
  ...sharedPaths.map((relativePath) => legacyEntry("shared", relativePath, 10)),
  ...taskPaths.map((relativePath) => legacyEntry("task", relativePath, 10)),
  ...sharedPaths.map((relativePath) => legacyEntry("shared", relativePath, 11)),
  ...taskPaths.map((relativePath) => legacyEntry("task", relativePath, 11)),
];

export const legacyCocosTemplateRegistry: TemplateEntry[] = [
  legacyEntry("task", "ledger/designs/template-cocos-scene.md", 1),
  legacyEntry("task", "ledger/designs/template-cocos-scene.md", 2),
];

export interface PackEntry {
  relativePath: string;
  sourcePath: string;
  scope: "task";
  managed: boolean;
}

export interface TemplatePack {
  id: string;
  description: string;
  entries: PackEntry[];
}

export const packRegistry: TemplatePack[] = [
  {
    id: "cocos",
    description: "Cocos Creator 场景、Prefab、组件与资源设计模板",
    entries: [{
      relativePath: "designs/template-cocos-scene.md",
      sourcePath: join(TEMPLATE_ROOT, "packs", "cocos", "task", "ledger", "designs", "template-cocos-scene.md"),
      scope: "task",
      managed: true,
    }],
  },
  {
    id: "game-architecture",
    description: "游戏架构讨论、候选比较、表现契约与最终决策模板",
    entries: [
      {
        relativePath: "designs/game-architecture-guide.md",
        sourcePath: join(TEMPLATE_ROOT, "packs", "game-architecture", "task", "ledger", "designs", "game-architecture-guide.md"),
        scope: "task",
        managed: true,
      },
      {
        relativePath: "designs/template-game-architecture.md",
        sourcePath: join(TEMPLATE_ROOT, "packs", "game-architecture", "task", "ledger", "designs", "template-game-architecture.md"),
        scope: "task",
        managed: true,
      },
    ],
  },
];

export const workspaceFiles: Array<[string, string]> = templateRegistry.map((template) => [
  template.relativePath,
  readFileSync(template.sourcePath, "utf8"),
]);

export const learningsHeader = readTemplate("heuristics/learnings.md");

export function readTemplate(relativePath: string): string {
  const template = templateRegistry.find((item) => item.relativePath === relativePath);
  if (!template) throw new Error(`未知模板: ${relativePath}`);
  return readFileSync(template.sourcePath, "utf8");
}

function entry(scope: TemplateScope, relativePath: string): TemplateEntry {
  return {
    relativePath,
    sourcePath: join(TEMPLATE_ROOT, scope, relativePath),
    scope,
    managed: !statefulPaths.has(relativePath),
  };
}

function legacyEntry(scope: TemplateScope, relativePath: string, version: number): TemplateEntry {
  const root = LEGACY_TEMPLATE_ROOTS[version];
  if (!root) throw new Error(`不支持的历史模板版本: ${version}`);
  return {
    relativePath,
    sourcePath: join(root, scope, relativePath),
    scope,
    managed: true,
  };
}
