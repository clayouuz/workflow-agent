import { strict as assert } from "node:assert";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseBenchmarks } from "../src/core/benchmarks.ts";
import { renderCurrent } from "../src/core/current.ts";
import { createTestWorkspace } from "./helpers/cli.ts";

const BENCHMARKS = `# Benchmark 清单

## B1 状态测试 【in_progress】

### 验收标准
- [ ] B1-A1 [auto] 状态可解析

### 步骤
- [ ] B1-S1 等待接口
- [ ] B1-S2 可继续工作
`;

export function test_B1_A1_parser_exposes_step_state() {
  const [bench] = parseBenchmarks(BENCHMARKS);
  assert.equal(bench.status, "in_progress");
  assert.deepStrictEqual(
    (bench as unknown as { steps: Array<{ id: string; state: string }> }).steps.map((s) => [s.id, s.state]),
    [["B1-S1", "pending"], ["B1-S2", "pending"]],
  );
}

export function test_B1_A3_current_limits_suspended_summary_without_losing_total() {
  const suspended = Array.from({ length: 5 }, (_, index) => ({
    benchmarkId: "B1",
    stepId: `B1-S${index + 1}`,
    reason: `原因${index + 1}`,
  }));
  const current = renderCurrent({
    stage: "实现",
    benchmarkId: "B1",
    stepId: "B1-S9",
    next: "继续实现",
    loadRefs: ["ledger/benchmarks.md#B1"],
    suspended,
    suspendedTotal: suspended.length,
  });
  assert.match(current, /B1\/B1-S1 原因1/);
  assert.doesNotMatch(current, /B1-S4 原因4/);
  assert.match(current, /另有 2 项/);
}

export async function test_B1_A2_suspend_next_resume_lifecycle() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.write("tasks/T1-默认/ledger/benchmarks.md", BENCHMARKS);

    await ws.run("ledger", "step", "suspend", "B1", "B1-S1", "等待 API", "--resume-when", "接口确认");
    const next = await ws.run("ledger", "next", "B1");
    assert.match(next, /B1-S2/);

    const current = await readFile(join(ws.workflow, "tasks", "T1-默认", "ledger", "current.md"), "utf8");
    assert.match(current, /## 挂起提醒/);
    assert.match(current, /B1-S1.*等待 API.*接口确认/);

    await assert.rejects(() => ws.run("ledger", "step", "done", "B1", "B1-S1"));
    await ws.run("ledger", "step", "resume", "B1", "B1-S1", "接口已确认");
    await ws.run("ledger", "step", "done", "B1", "B1-S1");
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A4_history_has_structured_events() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.write("tasks/T1-默认/ledger/benchmarks.md", BENCHMARKS);
    await ws.run("ledger", "event", "B1", "decision", "采用连续版本", "--reason", "避免随机路径");
    const history = await readFile(join(ws.workflow, "tasks", "T1-默认", "ledger", "history", "B1.md"), "utf8");
    assert.match(history, /^- \d{4}-\d{2}-\d{2}: decision \| 采用连续版本 \| 避免随机路径$/m);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A4_compile_generates_real_versioned_archive_path() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const ledger = "tasks/T1-默认/ledger";
    await ws.write(`${ledger}/benchmarks.md`, BENCHMARKS.replace("【in_progress】", "【done】"));
    const draft = JSON.stringify({
      benchmarkId: "B1",
      stillBinding: ["连续版本"],
      superseded: [],
      contextualArchived: 0,
    }, null, 2) + "\n";

    await ws.write(`${ledger}/history/B1.md`, "- 2026-08-20: decision | 第一次 | -\n");
    await ws.write(`${ledger}/snapshots/B1-draft.json`, draft);
    await ws.run("ledger", "compile", "B1");

    await ws.write(`${ledger}/history/B1.md`, "- 2026-08-20: decision | 第二次 | -\n");
    await ws.write(`${ledger}/snapshots/B1-draft.json`, draft);
    await ws.run("ledger", "compile", "B1");

    const archive1 = join(ws.workflow, ledger, "history", "archive", "B1-v001.md");
    const archive2 = join(ws.workflow, ledger, "history", "archive", "B1-v002.md");
    assert.equal((await readFile(archive1, "utf8")).includes("第一次"), true);
    assert.equal((await readFile(archive2, "utf8")).includes("第二次"), true);

    const snapshot = JSON.parse(await readFile(join(ws.workflow, ledger, "snapshots", "B1-snapshot.json"), "utf8"));
    assert.equal(snapshot.sourceEvents.archive, "history/archive/B1-v002.md");
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A4_invalid_draft_does_not_move_history() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const ledger = "tasks/T1-默认/ledger";
    await ws.write(`${ledger}/benchmarks.md`, BENCHMARKS.replace("【in_progress】", "【done】"));
    await ws.write(`${ledger}/history/B1.md`, "- 2026-08-20: decision | 保留 | -\n");
    await ws.write(`${ledger}/snapshots/B1-draft.json`, "{\"benchmarkId\":\"B1\"}\n");
    await assert.rejects(() => ws.run("ledger", "compile", "B1"));
    const history = await readFile(join(ws.workflow, ledger, "history", "B1.md"), "utf8");
    assert.match(history, /保留/);
  } finally {
    await ws.cleanup();
  }
}
