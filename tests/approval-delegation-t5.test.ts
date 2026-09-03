import { strict as assert } from "node:assert";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CURRENT_SCHEMA_VERSION, readTemplate } from "../src/core/templates.ts";
import { createTestWorkspace, type TestWorkspace } from "./helpers/cli.ts";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DELEGATED_CONTEXT = "discussion/delegated-approval.md";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function delegationState(ws: TestWorkspace): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(ws.workflow, "tasks/T1-默认/ledger/delegation-state.json"), "utf8"));
}

async function template(version: number, scope: "shared" | "task", relativePath: string): Promise<string> {
  return readFile(join(REPO_ROOT, "templates", `v${version}`, scope, relativePath), "utf8");
}

function delegatedAuthority(): string {
  return `# 权威说明

## 目标
验证审批委托

## 审批委托
- 状态：已委托
- 范围：当前任务
- 授权依据：用户明确授权
`;
}

function delegatedCurrent(): string {
  return `# 任务入口

## 当前阶段
实现与验证

## 当前工作
继续委托任务

## 下一步
自主推进

## 继续工作时加载
- ${DELEGATED_CONTEXT}

## 挂起提醒
（无）
`;
}

async function seedV3Workspace(ws: TestWorkspace, customWorkflow = false): Promise<{ workflow: string; authority: string }> {
  const workflow = customWorkflow
    ? "# 用户自定义协作流程\n\n保留原有审批约定。\n"
    : await template(3, "shared", "discussion/workflow.md");
  const authority = "# 已有任务事实\n\n不得丢失。\n";
  await ws.write("tasks/active.txt", "T1-默认\n");
  await ws.write("tasks/T1-默认/ledger/authority.md", authority);
  await ws.write("discussion/workflow.md", workflow);
  await ws.write("schema.json", JSON.stringify({
    structureVersion: 3,
    templateVersion: 3,
    templateFingerprints: {},
    candidates: [],
    archives: [],
    taskPacks: {},
  }, null, 2) + "\n");
  return { workflow, authority };
}

async function seedV4DelegatedWorkspace(
  ws: TestWorkspace,
  customDelegated = false,
): Promise<{ workflow: string; authority: string; current: string; delegated: string }> {
  const workflow = await template(4, "shared", "discussion/workflow.md");
  const authority = delegatedAuthority();
  const current = delegatedCurrent();
  const delegated = customDelegated
    ? "# 用户自定义审批委托\n\n保留这一约定。\n"
    : await template(4, "shared", DELEGATED_CONTEXT);
  await ws.write("tasks/active.txt", "T1-默认\n");
  await ws.write("tasks/T1-默认/ledger/authority.md", authority);
  await ws.write("tasks/T1-默认/ledger/current.md", current);
  await ws.write("discussion/workflow.md", workflow);
  await ws.write(DELEGATED_CONTEXT, delegated);
  await ws.write("schema.json", JSON.stringify({
    structureVersion: 4,
    templateVersion: 4,
    templateFingerprints: {},
    candidates: [],
    archives: [],
    taskPacks: {},
  }, null, 2) + "\n");
  return { workflow, authority, current, delegated };
}

export async function test_B1_A1_regular_task_excludes_delegated_approval_context() {
  const ws = await createTestWorkspace();
  try {
    assert.equal(CURRENT_SCHEMA_VERSION, 10);
    assert.match(readTemplate(DELEGATED_CONTEXT), /# 审批委托模式/);
    await ws.run("ledger", "init");
    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.equal(schema.structureVersion, 10);
    assert.equal(await exists(join(ws.workflow, DELEGATED_CONTEXT)), true);
    const authority = await readFile(join(ws.workflow, "tasks/T1-默认/ledger/authority.md"), "utf8");
    assert.match(authority, /## 审批委托[\s\S]*状态：常规/);
    assert.doesNotMatch(await ws.run("ledger", "load"), /# 审批委托模式/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A2_delegated_reference_loads_only_for_bound_task() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.write("tasks/T1-默认/ledger/authority.md", delegatedAuthority());
    await ws.write("tasks/T1-默认/ledger/current.md", delegatedCurrent());
    const output = await ws.run("ledger", "load");
    assert.match(output, /===== discussion\/delegated-approval\.md =====/);
    assert.match(output, /# 审批委托模式/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B1_A3_new_task_does_not_inherit_delegation() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.write("tasks/T1-默认/ledger/authority.md", delegatedAuthority());
    await ws.write("tasks/T1-默认/ledger/current.md", delegatedCurrent());
    await ws.run("ledger", "task", "new", "第二任务");

    const authority = await readFile(join(ws.workflow, "tasks/T2-第二任务/ledger/authority.md"), "utf8");
    assert.match(authority, /## 审批委托[\s\S]*状态：常规/);
    assert.doesNotMatch(authority, /状态：已委托/);
    assert.doesNotMatch(await ws.run("ledger", "load"), /# 审批委托模式/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B2_A1_v3_migration_updates_workflow_and_adds_optional_context() {
  const ws = await createTestWorkspace();
  try {
    const seeded = await seedV3Workspace(ws);
    await ws.run("ledger", "migrate");

    assert.equal(await readFile(join(ws.workflow, "discussion/workflow.md"), "utf8"), await template(9, "shared", "discussion/workflow.md"));
    assert.equal(await exists(join(ws.workflow, DELEGATED_CONTEXT)), true);
    assert.doesNotMatch(await ws.run("ledger", "load"), /# 审批委托模式/);
    const schema = JSON.parse(await readFile(join(ws.workflow, "schema.json"), "utf8"));
    assert.equal(schema.structureVersion, 10);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B2_A2_v3_migration_preserves_authority_and_custom_workflow() {
  const ws = await createTestWorkspace();
  try {
    const seeded = await seedV3Workspace(ws, true);
    await ws.run("ledger", "migrate");

    assert.equal(await readFile(join(ws.workflow, "discussion/workflow.md"), "utf8"), seeded.workflow);
    assert.equal(
      await readFile(join(ws.workflow, "tasks/T1-默认/ledger/authority.md"), "utf8"),
      seeded.authority,
    );
    assert.equal(
      await readFile(join(ws.workflow, "migration/candidates/v10/discussion/workflow.md"), "utf8"),
      await template(10, "shared", "discussion/workflow.md"),
    );
  } finally {
    await ws.cleanup();
  }
}

export async function test_B2_A3_verify_script_covers_template_migration_changes() {
  const script = await readFile(join(REPO_ROOT, "verify-demo.bat"), "utf8");
  assert.match(script, /test impact[^\r\n]*src\\core\\templates\.ts/);
  assert.match(script, /node tests\\run\.ts/);
  assert.match(script, /test run/);
}

export async function test_B3_A1_rules_require_task_specific_delegation_boundary() {
  assert.equal(CURRENT_SCHEMA_VERSION, 10);
  const delegated = readTemplate(DELEGATED_CONTEXT);
  assert.match(delegated, /## 启用前的边界讨论/);
  assert.match(delegated, /自动审批范围/);
  assert.match(delegated, /不可自动审批/);
  assert.match(delegated, /用户验收/);
  assert.match(delegated, /重新讨论条件/);

  const authority = readTemplate("ledger/authority.md");
  assert.match(authority, /## 审批委托[\s\S]*状态：常规/);
  assert.doesNotMatch(authority, /自动审批范围：/);

  const skill = await readFile(join(REPO_ROOT, "SKILL.md"), "utf8");
  assert.match(skill, /委托任务读取 `discussion\/delegated-approval\.md`/);
  assert.doesNotMatch(skill, /笼统委托等待一次边界确认/);
}

export async function test_B3_A2_rules_distinguish_vague_and_explicit_delegation() {
  const delegated = readTemplate(DELEGATED_CONTEXT);
  assert.match(delegated, /笼统委托[\s\S]*等待.*确认/);
  assert.match(delegated, /边界.*明确[\s\S]*复述[\s\S]*直接启用/);
  assert.match(delegated, /只.*讨论.*受影响.*边界/);
}

export async function test_B3_A3_v4_migration_preserves_delegated_task_state_and_reference() {
  const ws = await createTestWorkspace();
  try {
    const seeded = await seedV4DelegatedWorkspace(ws);
    await ws.run("ledger", "migrate");

    assert.equal(await readFile(join(ws.workflow, "discussion/workflow.md"), "utf8"), await template(9, "shared", "discussion/workflow.md"));
    assert.equal(
      await readFile(join(ws.workflow, "tasks/T1-默认/ledger/authority.md"), "utf8"),
      seeded.authority,
    );
    assert.equal(
      await readFile(join(ws.workflow, "tasks/T1-默认/ledger/current.md"), "utf8"),
      seeded.current,
    );
    assert.equal(
      await readFile(join(ws.workflow, DELEGATED_CONTEXT), "utf8"),
      await template(9, "shared", DELEGATED_CONTEXT),
    );
    assert.match(await ws.run("ledger", "load"), /## 启用前的边界讨论/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B3_A3_v4_custom_delegated_rules_are_preserved_with_v8_candidate() {
  const ws = await createTestWorkspace();
  try {
    const seeded = await seedV4DelegatedWorkspace(ws, true);
    await ws.run("ledger", "migrate");

    assert.equal(await readFile(join(ws.workflow, DELEGATED_CONTEXT), "utf8"), seeded.delegated);
    assert.equal(
      await readFile(join(ws.workflow, "migration/candidates/v10", DELEGATED_CONTEXT), "utf8"),
      await template(10, "shared", DELEGATED_CONTEXT),
    );
  } finally {
    await ws.cleanup();
  }
}

export async function test_B4_A1_delegated_task_requires_complete_confirmed_discussion_chain() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.write("tasks/T1-默认/ledger/authority.md", delegatedAuthority());
    await ws.write("tasks/T1-默认/ledger/designs/solution.md", "# 方案\n\n保持范围最小。\n");
    await ws.write("tasks/T1-默认/ledger/designs/code.md", "# 代码设计\n\n修改 CLI 并测试。\n");

    await ws.run("ledger", "delegation", "enable", "用户确认委托边界");
    await assert.rejects(ws.run("ledger", "delegation", "permit"), /当前状态.*boundary_confirmed/);
    await ws.run("ledger", "delegation", "discuss", "solution", "ledger/designs/solution.md");
    await assert.rejects(ws.run("ledger", "delegation", "permit"), /solution_discussed/);
    await ws.run("ledger", "delegation", "confirm", "solution", "用户明确确认方案");
    await ws.run("ledger", "delegation", "discuss", "code", "ledger/designs/code.md");
    await ws.run("ledger", "delegation", "confirm", "code", "用户明确确认代码设计");
    assert.match(await ws.run("ledger", "delegation", "permit"), /已取得实现许可/);
    assert.equal((await delegationState(ws)).phase, "implementation_permitted");
  } finally {
    await ws.cleanup();
  }
}

export async function test_B4_A2_combined_design_and_hash_invalidation_are_guarded() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.write("tasks/T1-默认/ledger/authority.md", delegatedAuthority());
    await ws.write("tasks/T1-默认/ledger/designs/combined.md", "# 合并设计\n\n第一版。\n");
    await ws.run("ledger", "delegation", "enable", "用户确认委托边界");
    await assert.rejects(
      ws.run("ledger", "delegation", "confirm", "combined", "提前确认"),
      /不能确认 combined/,
    );
    await ws.run("ledger", "delegation", "discuss", "combined", "ledger/designs/combined.md");
    await ws.write("tasks/T1-默认/ledger/designs/combined.md", "# 合并设计\n\n第二版。\n");
    await assert.rejects(
      ws.run("ledger", "delegation", "confirm", "combined", "用户确认未重新展示的第二版"),
      /请重新记录讨论/,
    );
    await ws.run("ledger", "delegation", "discuss", "combined", "ledger/designs/combined.md");
    await ws.run("ledger", "delegation", "confirm", "combined", "用户明确确认第二版合并设计");
    await ws.write("tasks/T1-默认/ledger/designs/combined.md", "# 合并设计\n\n第三版。\n");
    await assert.rejects(ws.run("ledger", "delegation", "permit"), /设计内容已变化/);
    assert.equal((await delegationState(ws)).phase, "combined_design_discussed");
    await ws.run("ledger", "delegation", "confirm", "combined", "用户确认第三版合并设计");
    assert.match(await ws.run("ledger", "delegation", "permit"), /已取得实现许可/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B4_A3_v5_migration_is_safe_and_regular_tasks_remain_unaffected() {
  const delegated = await createTestWorkspace();
  const regular = await createTestWorkspace();
  try {
    await delegated.write("tasks/active.txt", "T1-默认\n");
    await delegated.write("tasks/T1-默认/ledger/authority.md", delegatedAuthority());
    await delegated.write("schema.json", JSON.stringify({ structureVersion: 5, templateVersion: 5 }, null, 2));
    await delegated.run("ledger", "migrate");
    assert.equal((await delegationState(delegated)).phase, "boundary_confirmed");

    await regular.write("tasks/active.txt", "T1-默认\n");
    await regular.write("tasks/T1-默认/ledger/authority.md", "# 权威说明\n\n## 审批委托\n- 状态：常规\n");
    await regular.write("schema.json", JSON.stringify({ structureVersion: 5, templateVersion: 5 }, null, 2));
    await regular.run("ledger", "migrate");
    assert.equal(await exists(join(regular.workflow, "tasks/T1-默认/ledger/delegation-state.json")), false);
    assert.doesNotMatch(await regular.run("ledger", "load"), /delegation-state\.json/);
  } finally {
    await delegated.cleanup();
    await regular.cleanup();
  }
}
