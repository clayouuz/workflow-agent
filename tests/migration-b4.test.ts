import { strict as assert } from "node:assert";
import { access, mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTestWorkspace, type TestWorkspace } from "./helpers/cli.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function missing(path: string): Promise<boolean> {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
}

async function template(version: number, scope: "shared" | "task", relativePath: string): Promise<string> {
  return readFile(join(REPO_ROOT, "templates", `v${version}`, scope, relativePath), "utf8");
}

async function seedLegacyWorkspace(ws: TestWorkspace, customContext = false): Promise<void> {
  await ws.write("tasks/active.txt", "T1-默认\n");
  await ws.write("tasks/T1-默认/ledger/authority.md", "# 已有任务事实\n");
  await ws.write(
    "discussion/workflow.md",
    await template(1, "shared", "discussion/workflow.md"),
  );
  await ws.write(
    "discussion/context.md",
    customContext ? "# 用户自定义上下文\n\n保留这一段。\n" : await template(1, "shared", "discussion/context.md"),
  );
  await ws.write("discussion/rules.md", await template(1, "shared", "discussion/rules.md"));
}

export async function test_B4_A1_init_records_schema_and_template_fingerprints() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.equal(schema.structureVersion, 10);
    assert.equal(schema.templateVersion, 10);
    assert.match(schema.templateFingerprints["discussion/workflow.md"], /^[a-f0-9]{64}$/);
    assert.match(schema.templateFingerprints["ledger/designs/template-general.md"], /^[a-f0-9]{64}$/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B4_A2_migrate_updates_managed_templates_and_preserves_custom_files() {
  const ws = await createTestWorkspace();
  try {
    await seedLegacyWorkspace(ws, true);
    const oldRules = await readFile(join(ws.workflow, "discussion", "rules.md"), "utf8");
    const output = await ws.run("ledger", "migrate");

    assert.match(output, /迁移完成/);
    assert.equal(
      await readFile(join(ws.workflow, "discussion", "workflow.md"), "utf8"),
      await template(9, "shared", "discussion/workflow.md"),
    );
    assert.equal(
      await readFile(join(ws.workflow, "discussion", "context.md"), "utf8"),
      "# 用户自定义上下文\n\n保留这一段。\n",
    );
    assert.equal(
      await readFile(join(ws.workflow, "migration", "candidates", "v10", "discussion", "context.md"), "utf8"),
      await template(9, "shared", "discussion/context.md"),
    );
    assert.equal(await missing(join(ws.workflow, "discussion", "rules.md")), true);
    assert.equal(
      await readFile(join(ws.workflow, "migration", "archive", "v1", "discussion", "rules.md"), "utf8"),
      oldRules,
    );

    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.equal(schema.structureVersion, 10);
    assert.deepEqual(schema.archives[0].originalPath, "discussion/rules.md");
    assert.deepEqual(schema.archives[0].archivePath, "migration/archive/v1/discussion/rules.md");

    await ws.run("ledger", "migrate", "restore", "discussion/rules.md");
    assert.equal(await readFile(join(ws.workflow, "discussion", "rules.md"), "utf8"), oldRules);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B4_A3_rules_is_recoverably_archived() {
  const ws = await createTestWorkspace();
  try {
    await seedLegacyWorkspace(ws);
    const oldRules = await readFile(join(ws.workflow, "discussion", "rules.md"), "utf8");
    await ws.run("ledger", "migrate");

    assert.equal(await missing(join(ws.workflow, "discussion", "rules.md")), true);
    assert.equal(
      await readFile(join(ws.workflow, "migration", "archive", "v1", "discussion", "rules.md"), "utf8"),
      oldRules,
    );

    await ws.run("ledger", "migrate", "restore", "discussion/rules.md");
    assert.equal(await readFile(join(ws.workflow, "discussion", "rules.md"), "utf8"), oldRules);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B4_A4_migration_is_idempotent() {
  const ws = await createTestWorkspace();
  try {
    await seedLegacyWorkspace(ws, true);
    await ws.run("ledger", "migrate");
    const beforeSchema = await readFile(join(ws.workflow, "schema.json"), "utf8");
    const beforeCandidates = await readdir(join(ws.workflow, "migration", "candidates", "v10", "discussion"));

    const output = await ws.run("ledger", "migrate");

    assert.match(output, /无需迁移/);
    assert.equal(await readFile(join(ws.workflow, "schema.json"), "utf8"), beforeSchema);
    assert.deepEqual(
      await readdir(join(ws.workflow, "migration", "candidates", "v10", "discussion")),
      beforeCandidates,
    );

    await ws.run("ledger", "init");
    assert.equal(await readFile(join(ws.workflow, "schema.json"), "utf8"), beforeSchema);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B4_A4_restore_rejects_paths_outside_workspace() {
  const ws = await createTestWorkspace();
  try {
    await seedLegacyWorkspace(ws);
    await ws.run("ledger", "migrate");
    await assert.rejects(() => ws.run("ledger", "migrate", "restore", "../outside.md"), /无效工作区相对路径/);
    assert.equal(await missing(join(ws.root, "outside.md")), true);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B4_A4_failed_migration_leaves_original_workspace_unchanged() {
  const ws = await createTestWorkspace();
  try {
    await seedLegacyWorkspace(ws, true);
    const oldWorkflow = await readFile(join(ws.workflow, "discussion", "workflow.md"), "utf8");
    const oldRules = await readFile(join(ws.workflow, "discussion", "rules.md"), "utf8");
    await mkdir(join(ws.workflow, "migration", "candidates", "v10", "discussion", "context.md"), {
      recursive: true,
    });

    await assert.rejects(() => ws.run("ledger", "migrate"));

    assert.equal(await readFile(join(ws.workflow, "discussion", "workflow.md"), "utf8"), oldWorkflow);
    assert.equal(await readFile(join(ws.workflow, "discussion", "rules.md"), "utf8"), oldRules);
    assert.equal(await missing(join(ws.workflow, "schema.json")), true);
    assert.equal(await missing(`${ws.workflow}.migration-stage`), true);
    assert.equal(await missing(`${ws.workflow}.migration-backup`), true);
  } finally {
    await ws.cleanup();
  }
}
