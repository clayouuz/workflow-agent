import { strict as assert } from "node:assert";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { createTestWorkspace } from "./helpers/cli.ts";
import { expandUserPath, toPortablePath } from "../src/core/paths.ts";

export async function test_T10_A1_home_paths_expand_and_serialize_portably() {
  const home = homedir();
  assert.equal(expandUserPath("~"), home);
  assert.equal(expandUserPath("~/workflow-agent/src"), join(home, "workflow-agent", "src"));
  assert.equal(expandUserPath("~\\workflow-agent\\src"), join(home, "workflow-agent", "src"));
  assert.equal(toPortablePath(join(home, "workflow-agent", "src")), "~/workflow-agent/src");
}

export async function test_T10_A2_test_config_writes_home_paths_without_machine_absolute_prefix() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.run("test", "config", "~/workflow-agent/src", "~/workflow-agent/tests");
    const config = JSON.parse(await readFile(join(ws.workflow, "tests", "config.json"), "utf8"));
    assert.deepEqual(config.sourceRoots, ["~/workflow-agent/src"]);
    assert.deepEqual(config.testRoots, ["~/workflow-agent/tests"]);
    assert.doesNotMatch(JSON.stringify(config), /C:\\\\Users\\\\zhaoyan\\\\workflow-agent/);
  } finally { await ws.cleanup(); }
}
