import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function test_B3_A3_core_and_cocos_scenarios_are_separated() {
  const core = await readFile(join(process.cwd(), "tests", "agent-scenarios.md"), "utf8");
  const cocos = await readFile(join(process.cwd(), "tests", "agent-scenarios-cocos.md"), "utf8");
  const s3 = core.match(/## S3[\s\S]*?(?=## S4|$)/)?.[0] ?? "";
  assert.doesNotMatch(s3, /Laya|Cocos/i);
  assert.match(s3, /单位|原点|方向|层级|默认值/);
  assert.match(cocos, /Laya/);
  assert.match(cocos, /Cocos/);
}

export async function test_B3_A4_docs_explain_task_scoped_pack_commands() {
  for (const relative of ["README.md", "docs/cli-commands.md", "HANDOFF.md"]) {
    const content = await readFile(join(process.cwd(), ...relative.split("/")), "utf8");
    assert.match(content, /ledger pack/);
    assert.match(content, /任务/);
  }
}
