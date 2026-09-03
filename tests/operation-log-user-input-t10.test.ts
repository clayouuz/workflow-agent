import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function test_T10_A1_operation_log_rules_capture_user_initiated_checkpoints() {
  const template = await readFile(join(process.cwd(), "templates", "v10", "shared", "discussion", "operation-log.md"), "utf8");
  assert.match(template, /用户主动提出、确认、纠正或要求变更/);
  assert.match(template, /默认都具有复盘价值/);
  assert.match(template, /只有普通查询、机械编辑、重复命令和完整终端输出可以跳过/);
}
