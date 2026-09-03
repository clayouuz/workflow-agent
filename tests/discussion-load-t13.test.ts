import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTestWorkspace } from "./helpers/cli.ts";

const DESIGN = `# 讨论设计\n\n## 目标\n进入讨论上下文。\n\n## 具体方案\n保留状态和设计引用。\n\n## 验收方式\n加载和投影都可恢复。\n`;

async function setup() {
  const ws = await createTestWorkspace();
  await ws.run("ledger", "init");
  await ws.write("tasks/T1-默认/ledger/designs/discussion.md", DESIGN);
  await ws.run("ledger", "discussion", "init", "跨会话上下文恢复，LLM 判断为复杂任务");
  await ws.run("ledger", "discussion", "discuss", "combined", "ledger/designs/discussion.md");
  return ws;
}

export async function test_T13_A1_discussion_state_and_design_enter_default_load() {
  const ws = await setup();
  try {
    const output = await ws.run("ledger", "load");
    assert.match(output, /ledger\/discussion-state\.json/);
    assert.match(output, /进入讨论上下文/);
    const current = await readFile(join(ws.workflow, "tasks", "T1-默认", "ledger", "current.md"), "utf8");
    assert.match(current, /ledger\/discussion-state\.json/);
    assert.match(current, /ledger\/designs\/discussion\.md/);
  } finally { await ws.cleanup(); }
}

export async function test_T13_A2_project_preserves_discussion_projection() {
  const ws = await setup();
  try {
    await ws.run("ledger", "project");
    const current = await readFile(join(ws.workflow, "tasks", "T1-默认", "ledger", "current.md"), "utf8");
    assert.match(current, /讨论：combined_discussed/);
    assert.match(current, /ledger\/discussion-state\.json/);
    assert.match(current, /ledger\/designs\/discussion\.md/);
  } finally { await ws.cleanup(); }
}
