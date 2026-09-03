import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTestWorkspace, type TestWorkspace } from "./helpers/cli.ts";

async function missing(path: string): Promise<boolean> {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
}

async function seedV2(ws: TestWorkspace, customCocos: boolean): Promise<void> {
  await ws.write("tasks/active.txt", "T1-默认\n");
  await ws.write("tasks/T1-默认/ledger/authority.md", "# 旧任务\n");
  const cocos = customCocos ? "# 用户自定义 Cocos\n" : await readFile(join(process.cwd(), "templates", "v2", "task", "ledger", "designs", "template-cocos-scene.md"), "utf8");
  await ws.write("tasks/T1-默认/ledger/designs/template-cocos-scene.md", cocos);
  await ws.write("schema.json", JSON.stringify({
    structureVersion: 2,
    templateVersion: 2,
    templateFingerprints: {},
    candidates: [{ originalPath: "discussion/context.md", candidatePath: "migration/candidates/v2/discussion/context.md", templateVersion: 2 }],
    archives: [{
      originalPath: "discussion/rules.md",
      archivePath: "migration/archive/v1/discussion/rules.md",
      digest: createHash("sha256").update("# old rules\n").digest("hex"),
    }],
    taskPacks: customCocos ? { "T1-默认": ["cocos"] } : {},
  }, null, 2) + "\n");
  await ws.write("migration/candidates/v2/discussion/context.md", "# candidate\n");
  await ws.write("migration/archive/v1/discussion/rules.md", "# old rules\n");
}

export async function test_B2_A1_migrate_archives_official_cocos_without_enabling_pack() {
  const ws = await createTestWorkspace();
  try {
    await seedV2(ws, false);
    await ws.run("ledger", "migrate");
    assert.equal(await missing(join(ws.workflow, "tasks/T1-默认/ledger/designs/template-cocos-scene.md")), true);
    assert.equal(
      await readFile(join(ws.workflow, "migration/archive/v2/tasks/T1-默认/ledger/designs/template-cocos-scene.md"), "utf8"),
      await readFile(join(process.cwd(), "templates", "v2", "task", "ledger", "designs", "template-cocos-scene.md"), "utf8"),
    );
    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.equal(schema.structureVersion, 10);
    assert.deepEqual(schema.taskPacks, {});
  } finally {
    await ws.cleanup();
  }
}

export async function test_B2_A2_migrate_preserves_custom_cocos_and_pack_state() {
  const ws = await createTestWorkspace();
  try {
    await seedV2(ws, true);
    await ws.run("ledger", "migrate");
    const target = join(ws.workflow, "tasks/T1-默认/ledger/designs/template-cocos-scene.md");
    assert.equal(await readFile(target, "utf8"), "# 用户自定义 Cocos\n");
    assert.equal(await missing(join(ws.workflow, "migration/archive/v2/tasks/T1-默认/ledger/designs/template-cocos-scene.md")), true);
    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.deepEqual(schema.taskPacks, { "T1-默认": ["cocos"] });
  } finally {
    await ws.cleanup();
  }
}

export async function test_B2_A3_migrate_inherits_old_candidates_and_archives() {
  const ws = await createTestWorkspace();
  try {
    await seedV2(ws, false);
    await ws.run("ledger", "migrate");
    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.equal(schema.candidates.some((item: { originalPath: string }) => item.originalPath === "discussion/context.md"), true);
    assert.equal(schema.archives.some((item: { originalPath: string }) => item.originalPath === "discussion/rules.md"), true);
    await ws.run("ledger", "migrate", "restore", "discussion/rules.md");
    assert.equal(await readFile(join(ws.workflow, "discussion/rules.md"), "utf8"), "# old rules\n");
  } finally {
    await ws.cleanup();
  }
}

export async function test_B2_A4_migrate_v3_is_idempotent() {
  const ws = await createTestWorkspace();
  try {
    await seedV2(ws, false);
    await ws.run("ledger", "migrate");
    const before = await readFile(join(ws.workflow, "schema.json"), "utf8");
    const output = await ws.run("ledger", "migrate");
    assert.match(output, /无需迁移/);
    assert.equal(await readFile(join(ws.workflow, "schema.json"), "utf8"), before);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B2_A4_init_and_task_new_reject_v2_without_partial_upgrade() {
  const ws = await createTestWorkspace();
  try {
    await seedV2(ws, false);
    const schemaBefore = await readFile(join(ws.workflow, "schema.json"), "utf8");
    await assert.rejects(() => ws.run("ledger", "init"), /ledger migrate/);
    await assert.rejects(() => ws.run("ledger", "task", "new", "不应创建"), /ledger migrate/);
    assert.equal(await readFile(join(ws.workflow, "schema.json"), "utf8"), schemaBefore);
    assert.equal(await missing(join(ws.workflow, "tasks/T2-不应创建")), true);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B2_A3_schema_normalizes_pack_ids_without_losing_records() {
  const ws = await createTestWorkspace();
  try {
    await seedV2(ws, true);
    const path = join(ws.workflow, "schema.json");
    const schema = JSON.parse(await readFile(path, "utf8"));
    schema.taskPacks["T1-默认"] = ["cocos", "cocos"];
    await ws.write("schema.json", JSON.stringify(schema, null, 2) + "\n");
    await ws.run("ledger", "migrate");
    const migrated = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual(migrated.taskPacks, { "T1-默认": ["cocos"] });
    assert.equal(migrated.candidates.length >= 1, true);
    assert.equal(migrated.archives.length >= 1, true);
  } finally {
    await ws.cleanup();
  }
}
