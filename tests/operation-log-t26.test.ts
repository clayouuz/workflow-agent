import { strict as assert } from "node:assert";
import { access, cp, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { appendOperationAt, tailOperationsAt } from "../src/core/operation-log.ts";
import { createTestWorkspace, type TestWorkspace } from "./helpers/cli.ts";

async function missing(path: string): Promise<boolean> {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
}

async function operationFile(ws: TestWorkspace, taskId = "T1-默认"): Promise<string> {
  const dir = join(ws.workflow, "tasks", taskId, "ledger", "operations");
  const files = (await readdir(dir)).filter((name) => /^\d{4}-\d{2}\.ndjson$/.test(name));
  assert.equal(files.length, 1);
  return join(dir, files[0]);
}

async function readEvents(ws: TestWorkspace, taskId = "T1-默认") {
  const text = await readFile(await operationFile(ws, taskId), "utf8");
  return text.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function seedV6Workspace(ws: TestWorkspace, customContext = false): Promise<void> {
  const templates = join(process.cwd(), "templates", "v6");
  await cp(join(templates, "shared"), ws.workflow, { recursive: true });
  await cp(join(templates, "task", "ledger"), join(ws.workflow, "tasks", "T1-默认", "ledger"), { recursive: true });
  await ws.write("tasks/active.txt", "T1-默认\n");
  if (customContext) await ws.write("discussion/context.md", "# 用户自定义上下文\n\n必须保留。\n");
  await ws.write("schema.json", JSON.stringify({
    structureVersion: 6,
    templateVersion: 6,
    templateFingerprints: {},
    candidates: [],
    archives: [],
    taskPacks: {},
  }, null, 2) + "\n");
}

export async function test_B1_A1_global_and_log_help_are_successful_without_workspace() {
  const ws = await createTestWorkspace();
  try {
    for (const arg of ["--help", "-h", "help"]) {
      const output = await ws.run(arg);
      assert.match(output, /workflow-agent/);
      assert.match(output, /log\s+操作记录/);
    }
    for (const arg of ["--help", "-h"]) {
      const output = await ws.run("log", arg);
      assert.match(output, /log append/);
      assert.match(output, /log tail/);
      assert.match(output, /--artifact/);
    }
    assert.equal(await missing(ws.workflow), true);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A2_append_is_ndjson_ordered_and_preserves_artifact_references() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.run(
      "log", "append", "确认根因",
      "--type", "diagnosis",
      "--subject", "B4",
      "--reason", "目标位置被冻结",
      "--artifact", "missing/reference.png",
      "--artifact", "acceptance/B4/state.json",
    );
    await ws.run("log", "append", "完成修复", "--type", "implementation", "--subject", "W2");

    const events = await readEvents(ws);
    assert.equal(events.length, 2);
    assert.deepEqual(events.map((item) => item.summary), ["确认根因", "完成修复"]);
    assert.equal(events[0].version, 1);
    assert.equal(events[0].taskId, "T1-默认");
    assert.equal(events[0].type, "diagnosis");
    assert.equal(events[0].subject, "B4");
    assert.equal(events[0].reason, "目标位置被冻结");
    assert.deepEqual(events[0].artifacts, ["missing/reference.png", "acceptance/B4/state.json"]);
    assert.match(events[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A2_tail_limits_filters_and_isolates_tasks() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    for (let index = 1; index <= 25; index++) {
      const type = index % 2 === 0 ? "verification" : "note";
      const subject = index <= 22 ? "B1" : "B2";
      await ws.run("log", "append", `event-${String(index).padStart(2, "0")}`, "--type", type, "--subject", subject);
    }

    const defaultTail = (await ws.run("log", "tail")).trim().split(/\r?\n/);
    assert.equal(defaultTail.length, 20);
    assert.doesNotMatch(defaultTail.join("\n"), /event-05/);
    assert.match(defaultTail.join("\n"), /event-25/);

    const filtered = await ws.run("log", "tail", "10", "--type", "verification", "--subject", "B1");
    assert.match(filtered, /event-22/);
    assert.doesNotMatch(filtered, /event-21|event-24/);
    await assert.rejects(() => ws.run("log", "tail", "201"), /200/);

    await ws.run("ledger", "task", "new", "第二任务");
    await ws.run("log", "append", "only-t2", "--subject", "T2");
    assert.match(await ws.run("log", "tail"), /only-t2/);
    await ws.run("ledger", "task", "bind", "T1-默认");
    assert.doesNotMatch(await ws.run("log", "tail"), /only-t2/);
    assert.equal((await readEvents(ws, "T2-第二任务"))[0].taskId, "T2-第二任务");
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A3_append_fails_safely_and_never_rewrites_existing_prefix() {
  const ws = await createTestWorkspace();
  try {
    await assert.rejects(() => ws.run("log", "append", "不应写入"), /初始化|任务/);
    assert.equal(await missing(join(ws.workflow, "tasks")), true);

    await ws.run("ledger", "init");
    const month = new Date().toISOString().slice(0, 7);
    const relative = `tasks/T1-默认/ledger/operations/${month}.ndjson`;
    const prefix = `${JSON.stringify({ version: 1, timestamp: "2026-08-01T00:00:00.000Z", taskId: "T1-默认", type: "note", summary: "旧记录", artifacts: [] })}\n`.repeat(8000);
    await ws.write(relative, prefix);
    const before = await stat(join(ws.workflow, relative));

    await ws.run("log", "append", "新增记录");
    const content = await readFile(join(ws.workflow, relative), "utf8");
    const after = await stat(join(ws.workflow, relative));
    assert.equal(content.startsWith(prefix), true);
    assert.equal(after.size > before.size, true);
    assert.match(content.slice(prefix.length), /新增记录/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A3_core_storage_partitions_by_month_without_loading_old_files_on_append() {
  const ws = await createTestWorkspace();
  try {
    const operations = join(ws.root, "core-operations");
    await appendOperationAt(operations, "T-core", {
      summary: "八月记录",
      now: new Date("2026-08-31T23:59:59.000Z"),
    });
    await appendOperationAt(operations, "T-core", {
      summary: "九月记录",
      type: "verification",
      subject: "B1",
      now: new Date("2026-09-01T00:00:00.000Z"),
    });

    assert.deepEqual((await readdir(operations)).sort(), ["2026-08.ndjson", "2026-09.ndjson"]);
    const records = await tailOperationsAt(operations, { limit: 2 });
    assert.deepEqual(records.map((item) => item.summary), ["八月记录", "九月记录"]);
    assert.equal((await tailOperationsAt(operations, { subject: "B1" }))[0].summary, "九月记录");
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A3_tail_rejects_corrupted_ndjson_without_mutation() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const month = new Date().toISOString().slice(0, 7);
    const relative = `tasks/T1-默认/ledger/operations/${month}.ndjson`;
    const corrupted = "{not-json}\n";
    await ws.write(relative, corrupted);
    await assert.rejects(() => ws.run("log", "tail"), /损坏|JSON|ndjson/i);
    assert.equal(await readFile(join(ws.workflow, relative), "utf8"), corrupted);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A4_hot_rules_load_but_operation_records_remain_cold() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.equal(schema.structureVersion, 10);
    assert.equal(schema.templateVersion, 10);

    const firstLoad = await ws.run("ledger", "load");
    assert.match(firstLoad, /操作记录规则/);
    assert.match(firstLoad, /目标\/方案确认/);

    await ws.run("log", "append", "COLD-SECRET-MARKER");
    const secondLoad = await ws.run("ledger", "load");
    assert.doesNotMatch(secondLoad, /COLD-SECRET-MARKER/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A4_v6_migration_adds_hot_rules_and_preserves_custom_context() {
  const ws = await createTestWorkspace();
  try {
    await seedV6Workspace(ws, true);
    const output = await ws.run("ledger", "migrate");
    assert.match(output, /v6 -> v10/);
    assert.equal(
      await readFile(join(ws.workflow, "discussion", "context.md"), "utf8"),
      "# 用户自定义上下文\n\n必须保留。\n",
    );
    assert.match(await readFile(join(ws.workflow, "discussion", "operation-log.md"), "utf8"), /操作记录规则/);
    assert.match(
      await readFile(join(ws.workflow, "migration", "candidates", "v10", "discussion", "context.md"), "utf8"),
      /operation-log\.md/,
    );
    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.equal(schema.structureVersion, 10);
    assert.equal(schema.templateVersion, 10);
  } finally {
    await ws.cleanup();
  }
}
