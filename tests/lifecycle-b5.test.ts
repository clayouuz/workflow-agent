import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTestWorkspace } from "./helpers/cli.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LIFECYCLE_BENCHMARK = `# B9 生命周期

## 结果
生命周期完成。
## Environment
测试工作区。
## Entry
CLI。
## Fixture
固定文件。
## Action
执行状态机。
## Oracle
最终 accepted。
## Acceptance
- B9-A1 [auto] 生命周期完成
## Exclusions
无。
`;

const LIFECYCLE_WORK = `# B9-W1 生命周期工作

## 预期结果
工作完成。
## 影响模块
测试。
## 工作内容
写入值。
## 验证
B9-A1。
`;

export async function test_B5_A1_complete_task_lifecycle_through_cli() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.run("ledger", "task", "new", "集成");
    await ws.run("ledger", "task", "bind", "T1-默认");
    await ws.run("ledger", "task", "bind", "T2-集成");
    const ledger = "tasks/T2-集成/ledger";
    await ws.write(`${ledger}/benchmarks/B9.md`, LIFECYCLE_BENCHMARK);
    await ws.write(`${ledger}/work-items/B9-W1.md`, LIFECYCLE_WORK);
    await ws.run("ledger", "benchmark", "register", "B9", "ledger/benchmarks/B9.md");
    await ws.run("ledger", "benchmark", "ready", "B9");
    await ws.run("ledger", "work", "register", "B9-W1", "ledger/work-items/B9-W1.md", "--benchmark", "B9");
    await ws.run("ledger", "work", "start", "B9-W1");
    await ws.run("ledger", "work", "block", "B9-W1", "等待接口", "--resume-when", "接口可用");
    await ws.run("ledger", "work", "resume", "B9-W1", "接口可用");
    await ws.run("ledger", "work", "done", "B9-W1");
    await ws.run("ledger", "benchmark", "verify", "B9");

    await ws.write("project-src/value.ts", "export const value = 9;\n");
    await ws.write("project-tests/lifecycle.test.ts", `import { strict as assert } from "node:assert";
import { value } from "../project-src/value.ts";
export function test_B9_A1_lifecycle() { assert.equal(value, 9); }
`);
    await ws.run("test", "config", join(ws.workflow, "project-src"), join(ws.workflow, "project-tests"));
    await ws.run("test", "run", "--bid", "B9");
    await ws.run("test", "verify", "B9");
    await ws.run("ledger", "benchmark", "accept", "B9");
    await ws.write(`${ledger}/snapshots/B9-draft.json`, JSON.stringify({
      benchmarkId: "B9",
      stillBinding: ["生命周期通过 CLI 闭环"],
      superseded: [],
      contextualArchived: 0,
    }, null, 2) + "\n");
    await ws.run("ledger", "compile", "B9");

    const benchmarks = await readFile(join(ws.workflow, ledger, "benchmarks.md"), "utf8");
    assert.match(benchmarks, /## B9 生命周期 【accepted】/);
    const snapshot = JSON.parse(await readFile(join(ws.workflow, ledger, "snapshots", "B9-snapshot.json"), "utf8"));
    assert.equal(snapshot.sourceEvents.archive, null);
    assert.match(await readFile(join(ws.workflow, ledger, "machine-events", new Date().toISOString().slice(0, 7) + ".ndjson"), "utf8"), /benchmark_accepted/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B5_A2_task_ledgers_are_isolated_and_knowledge_is_shared() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.write("tasks/T1-默认/ledger/authority.md", "# T1 独有事实\n");
    await ws.run("knowledge", "add", "项目约定", "资源目录：assets/common");
    await ws.run("ledger", "task", "new", "第二任务");
    await ws.write("tasks/T2-第二任务/ledger/authority.md", "# T2 独有事实\n");

    assert.match(await ws.run("knowledge", "list"), /资源目录：assets\/common/);
    assert.match(await ws.run("ledger", "task", "list"), /\* T2-第二任务/);
    await ws.run("ledger", "task", "bind", "T1-默认");
    assert.match(await ws.run("ledger", "task", "list"), /\* T1-默认/);
    assert.equal(
      await readFile(join(ws.workflow, "tasks", "T1-默认", "ledger", "authority.md"), "utf8"),
      "# T1 独有事实\n",
    );
    assert.equal(
      await readFile(join(ws.workflow, "tasks", "T2-第二任务", "ledger", "authority.md"), "utf8"),
      "# T2 独有事实\n",
    );
  } finally {
    await ws.cleanup();
  }
}

export async function test_B5_A3_verify_script_covers_current_repository_checks() {
  const script = await readFile(join(REPO_ROOT, "verify-demo.bat"), "utf8");
  assert.match(script, /node tests\\run\.ts/);
  assert.match(script, /test build-graph/);
  assert.match(script, /test impact src/);
  assert.match(script, /test run/);
  assert.match(script, /ledger context/);
  assert.match(script, /ledger status/);
  assert.doesNotMatch(script, /demo-web|smoke\.test/i);
}
