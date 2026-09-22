import { strict as assert } from "node:assert";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createTestWorkspace } from "./helpers/cli.ts";
import { packRegistry, templateRegistry } from "../src/core/templates.ts";

async function missing(path: string): Promise<boolean> {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
}

function cocosTemplate(ws: { workflow: string }, task = "T1-默认"): string {
  return join(ws.workflow, "tasks", task, "ledger", "designs", "template-cocos-scene.md");
}

export async function test_B1_A1_init_has_only_general_templates() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.equal(schema.structureVersion, 12);
    assert.deepEqual(schema.taskPacks, {});
    assert.equal(await missing(cocosTemplate(ws)), true);
    assert.equal(await readFile(join(ws.workflow, "tasks", "T1-默认", "ledger", "designs", "template-general.md"), "utf8") !== "", true);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A1_core_registry_is_v12_and_excludes_pack_files() {
  assert.equal(templateRegistry.every((entry) => /[\\/]templates[\\/]v12[\\/]/.test(entry.sourcePath)), true);
  assert.equal(templateRegistry.some((entry) => /cocos/i.test(entry.relativePath)), false);
  assert.equal(packRegistry.some((pack) => pack.id === "cocos"), true);
}

export async function test_B1_A2_enable_is_task_scoped_and_recorded() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.run("ledger", "pack", "enable", "cocos");
    assert.match(await ws.run("ledger", "pack", "list"), /cocos.*已启用/s);
    assert.equal(await missing(cocosTemplate(ws)), false);
    await ws.run("ledger", "task", "new", "第二任务");
    assert.equal(await missing(cocosTemplate(ws, "T2-第二任务")), true);
    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.deepEqual(schema.taskPacks, { "T1-默认": ["cocos"] });
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A3_enable_is_idempotent_and_disable_protects_custom_content() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.run("ledger", "pack", "enable", "cocos");
    const target = cocosTemplate(ws);
    const firstContent = await readFile(target, "utf8");
    const firstSchema = await readFile(join(ws.workflow, "schema.json"), "utf8");
    await ws.run("ledger", "pack", "enable", "cocos");
    assert.equal(await readFile(target, "utf8"), firstContent);
    assert.equal(await readFile(join(ws.workflow, "schema.json"), "utf8"), firstSchema);

    await ws.run("ledger", "pack", "disable", "cocos");
    assert.equal(await missing(target), true);
    await ws.write("tasks/T1-默认/ledger/designs/template-cocos-scene.md", "# 用户自定义 Cocos 设计\n");
    await ws.run("ledger", "pack", "enable", "cocos");
    await assert.rejects(() => ws.run("ledger", "pack", "disable", "cocos"), /自定义|不会删除/);
    assert.equal(await readFile(target, "utf8"), "# 用户自定义 Cocos 设计\n");
    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.deepEqual(schema.taskPacks, { "T1-默认": ["cocos"] });
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A4_unknown_pack_fails_without_workspace_changes() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const before = await readFile(join(ws.workflow, "schema.json"), "utf8");
    await assert.rejects(() => ws.run("ledger", "pack", "enable", "unknown"), /未知 pack/);
    assert.equal(await readFile(join(ws.workflow, "schema.json"), "utf8"), before);
    assert.equal(await missing(cocosTemplate(ws)), true);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A4_pack_commands_require_initialized_current_schema() {
  const ws = await createTestWorkspace();
  try {
    await assert.rejects(() => ws.run("ledger", "pack", "list"), /未初始化/);
    await ws.write("schema.json", JSON.stringify({ structureVersion: 2, templateVersion: 2 }) + "\n");
    await assert.rejects(() => ws.run("ledger", "pack", "enable", "cocos"), /ledger migrate/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A4_pack_file_changes_roll_back_when_schema_write_fails() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const schemaPath = join(ws.workflow, "schema.json");
    const schemaBefore = await readFile(schemaPath, "utf8");
    const temporary = `${schemaPath}.tmp`;
    await mkdir(temporary);
    await assert.rejects(() => ws.run("ledger", "pack", "enable", "cocos"));
    assert.equal(await missing(cocosTemplate(ws)), true);
    assert.equal(await readFile(schemaPath, "utf8"), schemaBefore);

    await rm(temporary, { recursive: true });
    await ws.run("ledger", "pack", "enable", "cocos");
    const enabledSchema = await readFile(schemaPath, "utf8");
    await mkdir(temporary);
    await assert.rejects(() => ws.run("ledger", "pack", "disable", "cocos"));
    assert.equal(await missing(cocosTemplate(ws)), false);
    assert.equal(await readFile(schemaPath, "utf8"), enabledSchema);
  } finally {
    await ws.cleanup();
  }
}
