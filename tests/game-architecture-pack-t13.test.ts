import { strict as assert } from "node:assert";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTestWorkspace } from "./helpers/cli.ts";
import { CURRENT_SCHEMA_VERSION, packRegistry, templateRegistry } from "../src/core/templates.ts";

const GAME_PACK = "game-architecture";
const GUIDE = "designs/game-architecture-guide.md";
const TEMPLATE = "designs/template-game-architecture.md";

async function missing(path: string): Promise<boolean> {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
}

function packFile(workflow: string, relativePath: string, task = "T1-默认"): string {
  return join(workflow, "tasks", task, "ledger", relativePath);
}

export async function test_B1_A1_v12_registers_game_architecture_without_default_installation() {
  assert.equal(CURRENT_SCHEMA_VERSION, 12);
  assert.equal(templateRegistry.every((entry) => /[\\/]templates[\\/]v12[\\/]/.test(entry.sourcePath)), true);
  const pack = packRegistry.find((item) => item.id === GAME_PACK);
  assert.ok(pack);
  assert.deepEqual(pack.entries.map((entry) => entry.relativePath).sort(), [GUIDE, TEMPLATE].sort());

  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.equal(schema.structureVersion, 12);
    assert.deepEqual(schema.taskPacks, {});
    assert.equal(await missing(packFile(ws.workflow, GUIDE)), true);
    assert.equal(await missing(packFile(ws.workflow, TEMPLATE)), true);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A2_game_architecture_is_task_scoped_idempotent_and_composable() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const list = await ws.run("ledger", "pack", "list");
    assert.match(list, /cocos.*未启用/s);
    assert.match(list, /game-architecture.*未启用/s);

    await ws.run("ledger", "pack", "enable", GAME_PACK);
    const firstGuide = await readFile(packFile(ws.workflow, GUIDE), "utf8");
    const firstTemplate = await readFile(packFile(ws.workflow, TEMPLATE), "utf8");
    const firstSchema = await readFile(join(ws.workflow, "schema.json"), "utf8");
    await ws.run("ledger", "pack", "enable", GAME_PACK);
    assert.equal(await readFile(packFile(ws.workflow, GUIDE), "utf8"), firstGuide);
    assert.equal(await readFile(packFile(ws.workflow, TEMPLATE), "utf8"), firstTemplate);
    assert.equal(await readFile(join(ws.workflow, "schema.json"), "utf8"), firstSchema);

    await ws.run("ledger", "pack", "enable", "cocos");
    let schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.deepEqual(schema.taskPacks, { "T1-默认": ["cocos", GAME_PACK] });

    await ws.run("ledger", "task", "new", "第二任务");
    assert.equal(await missing(packFile(ws.workflow, GUIDE, "T2-第二任务")), true);
    assert.equal(await missing(packFile(ws.workflow, TEMPLATE, "T2-第二任务")), true);
    schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.deepEqual(schema.taskPacks, { "T1-默认": ["cocos", GAME_PACK] });
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A3_disable_is_atomic_and_protects_any_custom_pack_file() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.run("ledger", "pack", "enable", GAME_PACK);
    await ws.run("ledger", "pack", "disable", GAME_PACK);
    assert.equal(await missing(packFile(ws.workflow, GUIDE)), true);
    assert.equal(await missing(packFile(ws.workflow, TEMPLATE)), true);

    await ws.run("ledger", "pack", "enable", GAME_PACK);
    await ws.write(`tasks/T1-默认/ledger/${GUIDE}`, "# 用户自定义游戏架构指南\n");
    const untouchedTemplate = await readFile(packFile(ws.workflow, TEMPLATE), "utf8");
    await assert.rejects(() => ws.run("ledger", "pack", "disable", GAME_PACK), /自定义|不会删除/);
    assert.equal(await readFile(packFile(ws.workflow, GUIDE), "utf8"), "# 用户自定义游戏架构指南\n");
    assert.equal(await readFile(packFile(ws.workflow, TEMPLATE), "utf8"), untouchedTemplate);
    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.deepEqual(schema.taskPacks, { "T1-默认": [GAME_PACK] });
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A4_v10_migration_preserves_content_and_does_not_enable_new_pack() {
  const ws = await createTestWorkspace();
  try {
    await ws.write("tasks/active.txt", "T1-默认\n");
    await ws.write("tasks/T1-默认/ledger/authority.md", "# 用户已有任务事实\n\n不得丢失。\n");
    await ws.write("schema.json", JSON.stringify({
      structureVersion: 10,
      templateVersion: 10,
      templateFingerprints: {},
      candidates: [],
      archives: [],
      taskPacks: { "T1-默认": ["cocos"] },
    }, null, 2) + "\n");

    await ws.run("ledger", "migrate");
    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.equal(schema.structureVersion, 12);
    assert.equal(schema.templateVersion, 12);
    assert.deepEqual(schema.taskPacks, { "T1-默认": ["cocos"] });
    assert.equal(
      await readFile(join(ws.workflow, "tasks/T1-默认/ledger/authority.md"), "utf8"),
      "# 用户已有任务事实\n\n不得丢失。\n",
    );
    assert.equal(await missing(packFile(ws.workflow, GUIDE)), true);
    assert.equal(await missing(packFile(ws.workflow, TEMPLATE)), true);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A5_pack_documents_cover_architecture_decisions_without_process_governance() {
  const root = join(process.cwd(), "templates", "v12", "packs", GAME_PACK, "task", "ledger", "designs");
  const guide = await readFile(join(root, "game-architecture-guide.md"), "utf8");
  const template = await readFile(join(root, "template-game-architecture.md"), "utf8");
  const combined = `${guide}\n${template}`;

  for (const expected of ["玩家", "表现", "状态所有权", "生命周期", "候选架构", "端到端纵切", "职责与位置", "单一来源"]) {
    assert.match(combined, new RegExp(expected));
  }
  for (const forbidden of ["IMPLEMENTATION_LEDGER", "GAME_CONTEXT", "Benchmark-Status", "ledger benchmark", "ledger work", "game_context.py"]) {
    assert.doesNotMatch(combined, new RegExp(forbidden, "i"));
  }
}
