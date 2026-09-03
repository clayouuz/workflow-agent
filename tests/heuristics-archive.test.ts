import { strict as assert } from "node:assert";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createTestWorkspace } from "./helpers/cli.ts";

export async function test_heuristics_archive_uses_sequential_versions() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.run("heuristics", "learn", "第一次遗漏");
    await ws.run("heuristics", "distill");
    await ws.run("heuristics", "learn", "第二次遗漏");
    await ws.run("heuristics", "distill");

    const archive = join(ws.workflow, "heuristics", "archive");
    await access(join(archive, "learnings-v001.md"));
    await access(join(archive, "learnings-v002.md"));
    assert.match(await readFile(join(archive, "learnings-v001.md"), "utf8"), /第一次遗漏/);
    assert.match(await readFile(join(archive, "learnings-v002.md"), "utf8"), /第二次遗漏/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_tool_requests_use_sequential_versions() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.run("tool", "request", "ts-test-runner", "第一次扩展");
    await ws.run("tool", "request", "ts-test-runner", "第二次扩展");
    assert.deepEqual(
      (await readdir(join(ws.workflow, "tools", "requests"))).sort(),
      ["ts-test-runner-v001.md", "ts-test-runner-v002.md"],
    );
  } finally {
    await ws.cleanup();
  }
}
