import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTestWorkspace } from "./helpers/cli.ts";

export async function test_T10_A1_operation_log_distinguishes_user_and_ai() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.run("log", "append", "用户确认范围", "--actor", "user", "--type", "confirmation");
    await ws.run("log", "append", "Agent 完成检查", "--actor", "ai", "--type", "verification");
    const output = await ws.run("log", "tail", "10", "--actor", "user");
    assert.match(output, /\[user\/confirmation\]/);
    assert.doesNotMatch(output, /Agent 完成检查/);
    const month = new Date().toISOString().slice(0, 7);
    const text = await readFile(join(ws.workflow, "tasks", "T1-默认", "ledger", "operations", `${month}.ndjson`), "utf8");
    const records = text.trim().split(/\r?\n/).map((line) => JSON.parse(line));
    assert.deepEqual(records.map((record) => record.actor), ["user", "ai"]);
  } finally { await ws.cleanup(); }
}

export async function test_T10_A2_legacy_operation_records_default_to_ai_on_read() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const month = new Date().toISOString().slice(0, 7);
    await ws.write(`tasks/T1-默认/ledger/operations/${month}.ndjson`, `${JSON.stringify({ version: 1, timestamp: new Date().toISOString(), taskId: "T1-默认", type: "note", summary: "旧记录", artifacts: [] })}\n`);
    const output = await ws.run("log", "tail", "10", "--actor", "ai");
    assert.match(output, /\[ai\/note\].*旧记录/);
  } finally { await ws.cleanup(); }
}
