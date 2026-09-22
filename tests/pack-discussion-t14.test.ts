import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTestWorkspace, type TestWorkspace } from "./helpers/cli.ts";

const LEDGER = "tasks/T1-默认/ledger";
const GUIDE = "ledger/designs/game-architecture-guide.md";
const DESIGN = "ledger/designs/architecture-decision.md";

async function seedV11(ws: TestWorkspace, customWorkflow = false) {
  await ws.write("tasks/active.txt", "T1-默认\n");
  await ws.write(`${LEDGER}/authority.md`, "# 已有任务事实\n");
  for (const file of ["workflow.md", "context.md"]) {
    const content = await readFile(join(process.cwd(), "templates/v11/shared/discussion", file), "utf8");
    await ws.write(`discussion/${file}`, customWorkflow && file === "workflow.md" ? "# 自定义讨论流程\n保留用户约定。\n" : content);
  }
  await ws.write(`${LEDGER}/designs/README.md`, await readFile(join(process.cwd(), "templates/v11/task/ledger/designs/README.md"), "utf8"));
  await ws.write(`${LEDGER}/designs/project-design.md`, "# 用户设计\n不可覆盖。\n");
  await ws.write("schema.json", JSON.stringify({ structureVersion: 11, templateVersion: 11, templateFingerprints: {}, candidates: [], archives: [], taskPacks: { "T1-默认": ["cocos"] } }));
}

export async function test_B1_A1_initialized_workflow_routes_pack_use_to_discussion() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const workflow = await ws.run("ledger", "load", "discussion/workflow.md#讨论中的领域扩展包");
    assert.match(workflow, /目标、具体方案或验收方式/);
    assert.match(workflow, /ledger pack list/);
    assert.match(workflow, /ledger pack enable/);
    assert.match(workflow, /ledger load/);
    assert.match(workflow, /已确认的任务设计/);
    assert.match(workflow, /没有相关 Pack/);
    const skill = await readFile(join(process.cwd(), "SKILL.md"), "utf8");
    assert.match(skill, /讨论.*Pack/);
    assert.match(await ws.run("ledger", "pack", "list"), /game-architecture\s+未启用/);
    assert.doesNotMatch(await ws.run("ledger", "load"), /# 游戏架构决策指南/);
  } finally { await ws.cleanup(); }
}

export async function test_B1_A2_pack_reading_and_confirmed_design_have_separate_context_roles() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.run("ledger", "discussion", "init", "游戏架构讨论夹具");
    await ws.run("ledger", "pack", "enable", "game-architecture");
    assert.doesNotMatch(await ws.run("ledger", "load"), /# 游戏架构决策指南/);
    assert.match(await ws.run("ledger", "load", GUIDE), /状态所有权/);
    await ws.write(`tasks/T1-默认/${DESIGN}`, "# 测试设计\n\n## 目标\n表达玩家输入结果。\n\n## 具体方案\nDISCUSSION-DESIGN-MARKER：唯一状态所有者，通过投影供表现读取。\n\n## 验收方式\n检查重复输入和取消时的状态一致性。\n");
    await assert.rejects(() => ws.run("ledger", "discussion", "permit"), /不能取得执行许可/);
    await ws.run("ledger", "discussion", "discuss", "combined", DESIGN);
    // Confirmation here is a CLI fixture, not evidence of a real user's architecture acceptance.
    await ws.run("ledger", "discussion", "confirm", "combined", "测试夹具确认");
    await ws.run("ledger", "discussion", "permit");
    const recovered = await ws.run("ledger", "load");
    assert.match(recovered, /DISCUSSION-DESIGN-MARKER/);
    assert.match(recovered, /execution_permitted/);
    assert.doesNotMatch(recovered, /# 游戏架构决策指南/);
  } finally { await ws.cleanup(); }
}

export async function test_B1_A3_v11_migration_installs_discussion_rules_and_preserves_task_data() {
  const ws = await createTestWorkspace();
  try {
    await seedV11(ws);
    assert.match(await ws.run("ledger", "migrate"), /v11 -> v12/);
    assert.match(await ws.run("ledger", "load", "discussion/workflow.md"), /讨论中的领域扩展包/);
    assert.match(await ws.run("ledger", "load", "discussion/context.md"), /Pack/);
    assert.match(await ws.run("ledger", "load", "ledger/designs/README.md"), /game-architecture/);
    assert.equal(await readFile(join(ws.workflow, LEDGER, "designs/project-design.md"), "utf8"), "# 用户设计\n不可覆盖。\n");
    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.equal(schema.structureVersion, 12);
    assert.deepEqual(schema.taskPacks, { "T1-默认": ["cocos"] });
    assert.match(await ws.run("ledger", "pack", "list"), /game-architecture\s+未启用/);
  } finally { await ws.cleanup(); }
}

export async function test_B1_A4_v11_custom_discussion_is_preserved_with_candidate() {
  const ws = await createTestWorkspace();
  try {
    await seedV11(ws, true);
    await ws.run("ledger", "migrate");
    assert.equal(await readFile(join(ws.workflow, "discussion/workflow.md"), "utf8"), "# 自定义讨论流程\n保留用户约定。\n");
    assert.match(await readFile(join(ws.workflow, "migration/candidates/v12/discussion/workflow.md"), "utf8"), /讨论中的领域扩展包/);
  } finally { await ws.cleanup(); }
}
