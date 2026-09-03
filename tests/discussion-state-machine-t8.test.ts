import { strict as assert } from "node:assert";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createTestWorkspace } from "./helpers/cli.ts";
import { initialDiscussionState } from "../src/core/discussion.ts";

const DESIGN = `# 讨论设计\n\n## 目标\n完成目标。\n\n## 具体方案\n执行方案。\n\n## 验收方式\n自动测试通过。\n`;

async function setup() {
  const ws = await createTestWorkspace();
  await ws.run("ledger", "init");
  await ws.write("tasks/T1-默认/ledger/designs/discussion.md", DESIGN);
  return ws;
}

export async function test_T8_A1_complex_discussion_requires_three_confirmations() {
  assert.equal(initialDiscussionState("复杂任务").phase, "target_pending");
  const ws = await setup();
  try {
    await ws.run("ledger", "discussion", "init", "LLM 判断任务复杂，需要分阶段讨论");
    await ws.run("ledger", "discussion", "discuss", "target", "ledger/designs/discussion.md");
    await ws.run("ledger", "discussion", "confirm", "target", "用户确认目标");
    await ws.run("ledger", "discussion", "discuss", "plan", "ledger/designs/discussion.md");
    await ws.run("ledger", "discussion", "confirm", "plan", "用户确认方案");
    await ws.run("ledger", "discussion", "discuss", "acceptance", "ledger/designs/discussion.md");
    await ws.run("ledger", "discussion", "confirm", "acceptance", "用户确认验收方式");
    assert.match(await ws.run("ledger", "discussion", "permit"), /execution_permitted/);
    const state = JSON.parse(await readFile(join(ws.workflow, "tasks", "T1-默认", "ledger", "discussion-state.json"), "utf8"));
    assert.equal(state.phase, "execution_permitted");
  } finally { await ws.cleanup(); }
}

export async function test_T8_A2_illegal_jump_is_rejected() {
  const ws = await setup();
  try {
    await ws.run("ledger", "discussion", "init", "复杂任务");
    await assert.rejects(
      () => ws.run("ledger", "discussion", "confirm", "target", "越过讨论直接确认"),
      /不能确认|状态/,
    );
    await assert.rejects(
      () => ws.run("ledger", "discussion", "permit"),
      /不能取得|状态/,
    );
  } finally { await ws.cleanup(); }
}

export async function test_T8_A3_design_change_invalidates_confirmation() {
  const ws = await setup();
  try {
    await ws.run("ledger", "discussion", "init", "复杂任务");
    await ws.run("ledger", "discussion", "discuss", "combined", "ledger/designs/discussion.md");
    await ws.run("ledger", "discussion", "confirm", "combined", "用户确认合并设计");
    await ws.write("tasks/T1-默认/ledger/designs/discussion.md", DESIGN + "\n追加约束。\n");
    await assert.rejects(
      () => ws.run("ledger", "discussion", "permit"),
      /变化|失效/,
    );
    assert.match(await ws.run("ledger", "discussion", "status"), /combined_discussed/);
  } finally { await ws.cleanup(); }
}

export async function test_T8_A4_simple_task_does_not_create_discussion_state() {
  const ws = await setup();
  try {
    const output = await ws.run("ledger", "status");
    assert.doesNotMatch(output, /讨论状态机/);
    await assert.rejects(() => ws.run("ledger", "discussion", "status"), /未启用/);
  } finally { await ws.cleanup(); }
}

export async function test_T8_A5_non_modification_task_uses_same_flow() {
  const ws = await setup();
  try {
    await ws.run("ledger", "discussion", "init", "LLM 判断分析任务复杂");
    await ws.run("ledger", "discussion", "discuss", "combined", "ledger/designs/discussion.md");
    await ws.run("ledger", "discussion", "confirm", "combined", "用户确认分析目标、方案和验收");
    assert.match(await ws.run("ledger", "discussion", "permit"), /execution_permitted/);
  } finally { await ws.cleanup(); }
}

export async function test_T8_A6_discussion_state_rebuilds_from_machine_events() {
  const ws = await setup();
  try {
    await ws.run("ledger", "discussion", "init", "复杂任务");
    await ws.run("ledger", "discussion", "discuss", "combined", "ledger/designs/discussion.md");
    await ws.run("ledger", "discussion", "confirm", "combined", "用户确认");
    await rm(join(ws.workflow, "tasks/T1-默认/ledger/discussion-state.json"), { force: true });
    await ws.run("ledger", "repair");
    const state = JSON.parse(await readFile(join(ws.workflow, "tasks/T1-默认/ledger/discussion-state.json"), "utf8"));
    assert.equal(state.phase, "combined_confirmed");
  } finally { await ws.cleanup(); }
}
