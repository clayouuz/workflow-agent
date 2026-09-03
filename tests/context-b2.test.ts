import { strict as assert } from "node:assert";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { extractMarkdownSection } from "../src/core/markdown.ts";
import { estimateTokens, loadReference } from "../src/core/context.ts";
import { createTestWorkspace } from "./helpers/cli.ts";

async function missing(path: string): Promise<boolean> {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
}

export async function test_B2_A1_init_uses_layered_prompts_without_rules() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    assert.equal(await missing(join(ws.workflow, "discussion", "rules.md")), true);
    const skill = await readFile(join(process.cwd(), "SKILL.md"), "utf8");
    const workflow = await readFile(join(ws.workflow, "discussion", "workflow.md"), "utf8");
    const context = await readFile(join(ws.workflow, "discussion", "context.md"), "utf8");
    const strategy = await readFile(join(ws.workflow, "heuristics", "strategy.md"), "utf8");
    assert.match(skill, /# Workflow Agent/);
    assert.match(skill, /写入边界/);
    assert.match(workflow, /项目内容/);
    assert.match(context, /段落/);
    assert.match(strategy, /非强制/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B2_A2_init_has_no_example_benchmark_or_smoke_test() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const benchmarks = await readFile(join(ws.workflow, "tasks", "T1-默认", "ledger", "benchmarks.md"), "utf8");
    assert.doesNotMatch(benchmarks, /B0|示例/);
    assert.equal(await missing(join(ws.workflow, "tests", "smoke.test.ts")), true);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B2_A3_general_and_cocos_design_templates_are_independent() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const root = join(ws.workflow, "tasks", "T1-默认", "ledger", "designs");
    const general = await readFile(join(root, "template-general.md"), "utf8");
    assert.equal(await missing(join(root, "template-cocos-scene.md")), true);
    await ws.run("ledger", "pack", "enable", "cocos");
    const cocos = await readFile(join(root, "template-cocos-scene.md"), "utf8");
    assert.match(general, /黑盒约定/);
    assert.doesNotMatch(general, /Cocos|Prefab|节点层级/);
    assert.match(cocos, /黑盒约定/);
    assert.match(cocos, /Prefab|节点层级|坐标/);
  } finally {
    await ws.cleanup();
  }
}

export function test_B2_A4_extracts_exact_markdown_section() {
  const source = `# 根

## B1 一
甲

### 子项
乙

## B2 二
丙
`;
  assert.equal(extractMarkdownSection(source, "B1"), "## B1 一\n甲\n\n### 子项\n乙\n");
  assert.equal(extractMarkdownSection(source, "B2"), "## B2 二\n丙\n");
  assert.throws(() => extractMarkdownSection("## B1 一\n## B1 二\n", "B1"), /重复/);
}

export function test_B2_A4_token_estimate_is_conservative_for_cjk() {
  assert.equal(estimateTokens("中文测试"), 4);
  assert.equal(estimateTokens("abcdefgh"), 2);
}

export async function test_B2_A4_context_reference_rejects_workspace_escape() {
  await assert.rejects(() => loadReference("../SKILL.md"), /超出工作区/);
}

export async function test_B2_A4_load_outputs_fragment_and_records_estimate() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const ledger = "tasks/T1-默认/ledger";
    await ws.write(`${ledger}/benchmarks.md`, "# 清单\n\n## B1 一 【pending】\n只要甲\n\n## B2 二 【pending】\n不要乙\n");
    const output = await ws.run("ledger", "load", "ledger/benchmarks.md#B1");
    assert.match(output, /只要甲/);
    assert.doesNotMatch(output, /不要乙/);
    assert.match(output, /估算.*token/i);
    const loads = await readFile(join(ws.workflow, ledger, "loads.md"), "utf8");
    assert.match(loads, /benchmarks\.md#B1/);
    assert.match(loads, /字符数.*估算 token/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B2_A4_load_without_args_follows_current_references() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const ledger = "tasks/T1-默认/ledger";
    await ws.write(`${ledger}/benchmarks.md`, "# 清单\n\n## B7 当前 【pending】\n精确内容\n\n## B8 其他 【pending】\n不应加载\n");
    await ws.write(`${ledger}/current.md`, `# 任务入口

## 当前阶段
实现

## 当前工作
B7

## 下一步
继续

## 继续工作时加载
- ledger/benchmarks.md#B7

## 挂起提醒
（无）
`);
    const output = await ws.run("ledger", "load");
    assert.match(output, /精确内容/);
    assert.doesNotMatch(output, /不应加载/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B2_A4_switching_benchmark_drops_stale_benchmark_reference() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    const ledger = "tasks/T1-默认/ledger";
    await ws.write(`${ledger}/benchmarks.md`, `# 清单

## B1 一 【in_progress】
### 步骤
- [ ] B1-S1 第一步

## B2 二 【pending】
### 步骤
- [ ] B2-S1 第二步
`);
    await ws.run("ledger", "next", "B1");
    await ws.run("ledger", "next", "B2");
    const current = await readFile(join(ws.workflow, ledger, "current.md"), "utf8");
    assert.match(current, /benchmarks\.md#B2/);
    assert.doesNotMatch(current, /benchmarks\.md#B1/);
  } finally {
    await ws.cleanup();
  }
}

export async function test_B2_A4_knowledge_entries_remain_compact() {
  const ws = await createTestWorkspace();
  try {
    await ws.run("ledger", "init");
    await ws.run("knowledge", "add", "文档入口", "API 文档：docs/api.md");
    const knowledge = await readFile(join(ws.workflow, "knowledge", "index.md"), "utf8");
    assert.match(knowledge, /## 文档入口/);
    assert.match(knowledge, /- API 文档：docs\/api\.md/);
    assert.doesNotMatch(knowledge, /agent|\d{4}-\d{2}-\d{2}/i);
  } finally {
    await ws.cleanup();
  }
}
