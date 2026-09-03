import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTestWorkspace } from "./helpers/cli.ts";

const BENCHMARK = `# Benchmark 清单

## B3 验证测试 【in_progress】

### 验收标准
- [ ] B3-A1 [auto] 自动行为正确
- [ ] B3-A2 [manual] 用户确认界面正确

### 步骤
- [x] B3-S1 已实现
`;

async function preparePassingWorkspace() {
  const ws = await createTestWorkspace();
  await ws.run("ledger", "init");
  const ledger = "tasks/T1-默认/ledger";
  await ws.write(`${ledger}/benchmarks.md`, BENCHMARK);
  await ws.write("project-src/value.ts", "export const value = 1;\n");
  await ws.write("project-tests/value.test.ts", `import { strict as assert } from "node:assert";
import { value } from "../project-src/value.ts";
export function test_B3_A1_value_is_one() { assert.equal(value, 1); }
`);
  await ws.run("test", "config", join(ws.workflow, "project-src"), join(ws.workflow, "project-tests"));
  return ws;
}

export async function test_B3_A1_coverage_matches_full_acceptance_id() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const ledger = "tasks/T1-默认/ledger";
    await ws.write(`${ledger}/benchmarks.md`, BENCHMARK.replace("B3-A2 [manual]", "B3-A10 [auto]"));
    await ws.write("project-src/value.ts", "export const value = 1;\n");
    await ws.write("project-tests/value.test.ts", "export function test_B3_A1_only() {}\n");
    await ws.run("test", "config", join(ws.workflow, "project-src"), join(ws.workflow, "project-tests"));
    await ws.run("test", "run", "--bid", "B3");
    await assert.rejects(() => ws.run("test", "verify", "B3"));
    const record = JSON.parse(await readFile(join(ws.workflow, ledger, "verification", "B3.json"), "utf8"));
    assert.equal(record.automatic.acceptance["B3-A1"].passed, true);
    assert.equal(record.automatic.acceptance["B3-A10"].passed, false);
    assert.equal(record.status, "incomplete");
  } finally {
    await ws.cleanup();
  }
}

export async function test_B3_A2_manual_result_completes_valid_evidence() {
  const ws = await preparePassingWorkspace();
  try {
    await ws.run("test", "run", "--bid", "B3");
    await assert.rejects(() => ws.run("test", "verify", "B3"));
    await ws.run("test", "manual", "B3", "B3-A2", "pass", "用户确认正常");
    const output = await ws.run("test", "verify", "B3");
    assert.match(output, /valid/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B3_A2_failed_test_is_not_reported_as_valid() {
  const ws = await preparePassingWorkspace();
  try {
    await ws.write("project-tests/value.test.ts", "import { strict as assert } from 'node:assert'; export function test_B3_A1_fails(){ assert.equal(1, 2); }\n");
    await assert.rejects(() => ws.run("test", "run", "--bid", "B3"));
    const record = JSON.parse(await readFile(join(ws.workflow, "tasks", "T1-默认", "ledger", "verification", "B3.json"), "utf8"));
    assert.equal(record.status, "failed");
  } finally {
    await ws.cleanup();
  }
}

export async function test_B3_A3_source_change_makes_evidence_stale() {
  const ws = await preparePassingWorkspace();
  try {
    await ws.run("test", "run", "--bid", "B3");
    await ws.run("test", "manual", "B3", "B3-A2", "pass");
    await ws.write("project-src/value.ts", "export const value = 2;\n");
    await assert.rejects(() => ws.run("test", "verify", "B3"));
    const record = JSON.parse(await readFile(join(ws.workflow, "tasks", "T1-默认", "ledger", "verification", "B3.json"), "utf8"));
    assert.equal(record.status, "stale");
  } finally {
    await ws.cleanup();
  }
}

export async function test_B3_A4_accept_requires_valid_evidence_or_explicit_override() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const ledger = "tasks/T1-默认/ledger";
    await ws.write(`${ledger}/benchmarks.md`, BENCHMARK);
    await assert.rejects(() => ws.run("ledger", "accept", "B3"));
    await assert.rejects(() => ws.run("ledger", "accept", "B3", "--override"));
    await ws.run("ledger", "accept", "B3", "--override", "用户接受暂缺验证");
    const audit = await readFile(join(ws.workflow, ledger, "audit.md"), "utf8");
    assert.match(audit, /accept_override.*用户接受暂缺验证/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B3_A4_valid_accept_marks_acceptance_and_done() {
  const ws = await preparePassingWorkspace();
  try {
    await ws.run("test", "run", "--bid", "B3");
    await ws.run("test", "manual", "B3", "B3-A2", "pass", "用户确认");
    await ws.run("ledger", "accept", "B3");
    const benchmarks = await readFile(join(ws.workflow, "tasks", "T1-默认", "ledger", "benchmarks.md"), "utf8");
    assert.match(benchmarks, /## B3 验证测试 【done】/);
    assert.match(benchmarks, /- \[x\] B3-A1/);
    assert.match(benchmarks, /- \[x\] B3-A2/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B3_A2_no_tests_persists_incomplete_evidence() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const ledger = "tasks/T1-默认/ledger";
    await ws.write(`${ledger}/benchmarks.md`, BENCHMARK);
    await ws.write("empty-src/value.ts", "export const value = 1;\n");
    await ws.run("test", "config", join(ws.workflow, "empty-src"), join(ws.workflow, "empty-tests"));
    await assert.rejects(() => ws.run("test", "run", "--bid", "B3"));
    const record = JSON.parse(await readFile(join(ws.workflow, ledger, "verification", "B3.json"), "utf8"));
    assert.equal(record.status, "incomplete");
    assert.equal(record.automatic.run, null);
  } finally {
    await ws.cleanup();
  }
}
