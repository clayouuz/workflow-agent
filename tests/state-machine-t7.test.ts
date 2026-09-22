import { strict as assert } from "node:assert";
import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createTestWorkspace, type TestWorkspace } from "./helpers/cli.ts";
import { estimateTokens } from "../src/core/context.ts";

const CONTRACT = `# B1 攻击验收

## 结果
攻击结果可独立复验。

## Environment
测试运行时。

## Entry
固定入口。

## Fixture
固定状态。

## Action
执行一次攻击。

## Oracle
状态符合预期。

## Acceptance
- B1-A1 [auto] 自动行为正确

## Exclusions
不验证视觉。
`;

const WORK = `# W1 实现攻击

## 预期结果
实现测试所需行为。

## 影响模块
测试夹具。

## 工作内容
写入正确值。

## 验证
运行 B1-A1。
`;

async function prepare(ws: TestWorkspace): Promise<void> {
  await ws.run("ledger", "init");
  await ws.write("tasks/T1-默认/ledger/benchmarks/B1.md", CONTRACT);
  await ws.write("tasks/T1-默认/ledger/work-items/W1.md", WORK);
  await ws.run("ledger", "benchmark", "register", "B1", "ledger/benchmarks/B1.md");
  await ws.run("ledger", "work", "register", "W1", "ledger/work-items/W1.md", "--benchmark", "B1");
}

export async function test_B8_A1_benchmark_and_work_item_follow_legal_state_machines() {
  const ws = await createTestWorkspace();
  try {
    await prepare(ws);
    await assert.rejects(() => ws.run("ledger", "benchmark", "accept", "B1"), /状态|验证/);
    await assert.rejects(() => ws.run("ledger", "transition", "B1", "done"), /废弃|状态机|benchmark/);
    await ws.run("ledger", "benchmark", "ready", "B1");
    await ws.run("ledger", "work", "start", "W1");
    await ws.run("ledger", "work", "block", "W1", "等待接口", "--resume-when", "接口可用");
    assert.match(await ws.run("ledger", "work", "status", "W1"), /active.*blocked/s);
    await ws.run("ledger", "work", "resume", "W1", "接口可用");
    await ws.run("ledger", "work", "done", "W1");
    await ws.run("ledger", "benchmark", "verify", "B1");

    await ws.write("project-src/value.ts", "export const value = 1;\n");
    await ws.write("project-tests/value.test.ts", "import { strict as assert } from 'node:assert'; import { value } from '../project-src/value.ts'; export function test_B1_A1_value(){ assert.equal(value,1); }\n");
    await ws.run("test", "config", join(ws.workflow, "project-src"), join(ws.workflow, "project-tests"));
    await ws.run("test", "run", "--bid", "B1");
    await ws.run("ledger", "accept", "B1");
    assert.match(await ws.run("ledger", "benchmark", "status", "B1"), /accepted/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B8_A2_semantic_document_drift_invalidates_old_state() {
  const ws = await createTestWorkspace();
  try {
    await prepare(ws);
    await ws.run("ledger", "benchmark", "ready", "B1");
    await ws.run("ledger", "work", "start", "W1");
    await ws.run("ledger", "work", "done", "W1");
    await ws.write("tasks/T1-默认/ledger/work-items/W1.md", `${WORK}\n补充内容。\n`);
    assert.match(await ws.run("ledger", "work", "status", "W1"), /content-stale/);
    await assert.rejects(() => ws.run("ledger", "benchmark", "verify", "B1"), /W1|stale|变化/);

    await ws.write("tasks/T1-默认/ledger/benchmarks/B1.md", CONTRACT.replace("状态符合预期", "状态与事件符合预期"));
    assert.match(await ws.run("ledger", "benchmark", "status", "B1"), /contract-drift/);
    await assert.rejects(() => ws.run("ledger", "benchmark", "verify", "B1"), /drift|变化/);
    await ws.run("ledger", "benchmark", "reopen", "B1", "Contract 已修改");
    await ws.run("ledger", "benchmark", "ready", "B1");
  } finally {
    await ws.cleanup();
  }
}

export async function test_B8_A3_machine_events_rebuild_deleted_state_and_projections() {
  const ws = await createTestWorkspace();
  try {
    await prepare(ws);
    await ws.run("ledger", "benchmark", "ready", "B1");
    await ws.run("ledger", "work", "start", "W1");
    const ledger = join(ws.workflow, "tasks", "T1-默认", "ledger");
    const eventsBefore = await readFile(join(ledger, "machine-events", new Date().toISOString().slice(0, 7) + ".ndjson"), "utf8");
    await rm(join(ledger, "state"), { recursive: true, force: true });
    await rm(join(ledger, "current.md"), { force: true });
    await rm(join(ledger, "benchmarks.md"), { force: true });
    await ws.run("ledger", "repair");
    assert.match(await ws.run("ledger", "benchmark", "status", "B1"), /ready/);
    assert.match(await ws.run("ledger", "work", "status", "W1"), /active/);
    assert.match(await readFile(join(ledger, "benchmarks.md"), "utf8"), /本文件由 workflow-agent 生成/);
    assert.equal(await readFile(join(ledger, "machine-events", new Date().toISOString().slice(0, 7) + ".ndjson"), "utf8"), eventsBefore);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B8_A3_projection_edits_never_change_authoritative_state() {
  const ws = await createTestWorkspace();
  try {
    await prepare(ws);
    await ws.run("ledger", "benchmark", "ready", "B1");
    const ledger = "tasks/T1-默认/ledger";
    await ws.write(`${ledger}/benchmarks.md`, "# 伪造\n\nB1 accepted\n");
    await assert.rejects(() => ws.run("ledger", "current", "B1", "伪造下一步"), /只读投影/);
    await ws.run("ledger", "project");
    assert.doesNotMatch(await readFile(join(ws.workflow, ledger, "benchmarks.md"), "utf8"), /伪造/);
    assert.match(await ws.run("ledger", "benchmark", "status", "B1"), /ready/);
  } finally {
    await ws.cleanup();
  }
}

async function seedV7(ws: TestWorkspace): Promise<void> {
  const templates = join(process.cwd(), "templates", "v7");
  await cp(join(templates, "shared"), ws.workflow, { recursive: true });
  await cp(join(templates, "task", "ledger"), join(ws.workflow, "tasks", "T1-默认", "ledger"), { recursive: true });
  await ws.write("tasks/active.txt", "T1-默认\n");
  await ws.write("tasks/T1-默认/ledger/benchmarks.md", `# Benchmark 清单

## B7 旧完成项 【done】

### 验收标准
- [x] B7-A1 [auto] 旧检查

### 步骤
- [x] B7-S1 旧步骤
`);
  await ws.write("schema.json", JSON.stringify({ structureVersion: 7, templateVersion: 7, templateFingerprints: {}, candidates: [], archives: [], taskPacks: {} }, null, 2) + "\n");
}

export async function test_B8_A4_v7_done_without_valid_verification_is_not_migrated_as_accepted() {
  const ws = await createTestWorkspace();
  try {
    await seedV7(ws);
    const output = await ws.run("ledger", "migrate");
    assert.match(output, /v7 -> v12/);
    assert.match(await ws.run("ledger", "benchmark", "status", "B7"), /verifying/);
    assert.match(await readFile(join(ws.workflow, "tasks/T1-默认/ledger/benchmarks/B7.md"), "utf8"), /旧完成项/);
    assert.match(await readFile(join(ws.workflow, "tasks/T1-默认/ledger/work-items/B7-S1.md"), "utf8"), /旧步骤/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B8_A5_skill_is_compact_and_routes_details_to_layered_rules() {
  const skill = await readFile(join(process.cwd(), "SKILL.md"), "utf8");
  assert.equal(estimateTokens(skill) < 500, true);
  assert.match(skill, /语义文档/);
  assert.match(skill, /机器数据或投影/);
  assert.match(skill, /discussion\/workflow\.md/);
  assert.doesNotMatch(skill, /笼统委托等待|下一步小步骤|ledger step done/);
  assert.match(await readFile(join(process.cwd(), "templates/v8/shared/discussion/delegated-approval.md"), "utf8"), /启用前的边界讨论/);
  assert.match(await readFile(join(process.cwd(), "templates/v8/shared/discussion/operation-log.md"), "utf8"), /目标\/方案确认/);
}

export async function test_B8_A6_verify_script_covers_v8_state_and_full_regression() {
  const script = await readFile(join(process.cwd(), "verify-demo.bat"), "utf8");
  assert.match(script, /benchmark-machine\.ts/);
  assert.match(script, /machine-events\.ts/);
  assert.match(script, /projections\.ts/);
  assert.match(script, /node tests\\run\.ts/);
  assert.match(script, /test run/);
}
