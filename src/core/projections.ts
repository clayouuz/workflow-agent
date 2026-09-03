import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { exists, readJson, readText, writeTextAtomic } from "./fs.ts";
import { PATHS } from "./workspace.ts";
import type { BenchmarkMachineState } from "./benchmark-machine.ts";
import type { WorkItemMachineState } from "./work-item-machine.ts";
import { readBenchmarkContract } from "./semantic-documents.ts";
import { readMachineEvents, writeAggregateState } from "./machine-events.ts";
import { discussionReferences, readDiscussionState } from "./discussion.ts";

export async function readBenchmarkStates(): Promise<BenchmarkMachineState[]> {
  return readStates<BenchmarkMachineState>(PATHS.benchmarkState);
}

export async function readWorkItemStates(): Promise<WorkItemMachineState[]> {
  return readStates<WorkItemMachineState>(PATHS.workItemState);
}

export async function readBenchmarkState(id: string): Promise<BenchmarkMachineState> {
  const value = await readState<BenchmarkMachineState>(PATHS.benchmarkState, id);
  if (!value) throw new Error(`Benchmark 未注册: ${id}`);
  return value;
}

export async function readWorkItemState(id: string): Promise<WorkItemMachineState> {
  const value = await readState<WorkItemMachineState>(PATHS.workItemState, id);
  if (!value) throw new Error(`Work Item 未注册: ${id}`);
  return value;
}

export async function rebuildStateFromEvents(): Promise<void> {
  const latest = new Map<string, { aggregate: "benchmark" | "work_item" | "discussion"; id: string; state: unknown }>();
  for (const event of await readMachineEvents()) latest.set(`${event.aggregate}:${event.aggregateId}`, { aggregate: event.aggregate, id: event.aggregateId, state: event.state });
  for (const item of latest.values()) await writeAggregateState(item.aggregate, item.id, item.state);
}

export async function projectWorkflow(): Promise<void> {
  const benchmarks = await readBenchmarkStates();
  const works = await readWorkItemStates();
  const discussion = await readDiscussionState(PATHS.discussionState);
  const benchmarkLines = ["# Benchmark 清单", "", "> 本文件由 workflow-agent 生成，请勿直接编辑。", ""];
  for (const state of benchmarks.sort((a, b) => a.id.localeCompare(b.id))) {
    const contract = await readBenchmarkContract(state.id, state.reference);
    benchmarkLines.push(`## ${state.id} ${state.title} 【${state.phase}${state.hold ? "/blocked" : ""}】`, "", "### 验收标准");
    for (const item of contract.acceptance) benchmarkLines.push(`- [ ] ${item.id} [${item.mode}] ${item.description}`);
    const linked = works.filter((work) => work.benchmarks.includes(state.id));
    if (linked.length) {
      benchmarkLines.push("", "### Work Items");
      for (const work of linked) benchmarkLines.push(`- ${work.id} ${work.title} 【${work.phase}${work.hold ? "/blocked" : ""}】`);
    }
    benchmarkLines.push("");
  }
  await writeTextAtomic(PATHS.benchmarks, benchmarkLines.join("\n"));

  const activeBench = benchmarks.find((item) => !["accepted", "accepted_with_risk", "obsolete"].includes(item.phase));
  const activeWork = activeBench ? works.find((item) => item.benchmarks.includes(activeBench.id) && item.phase !== "done" && item.phase !== "obsolete") : undefined;
  const discussionRefs = discussion ? discussionReferences(discussion) : [];
  const benchmarkRefs = activeBench ? [activeBench.reference, ...(activeWork ? [activeWork.reference] : [])] : [];
  const loadRefs = [...new Set([...discussionRefs, ...benchmarkRefs])];
  const current = `# 任务入口

> 本文件由 workflow-agent 生成，请勿直接编辑。

## 当前阶段
${discussion ? `讨论：${discussion.phase}` : activeBench?.phase ?? "无活动 Benchmark"}

## 当前工作
${activeBench ? `${activeBench.id} ${activeBench.title}${activeWork ? ` / ${activeWork.id} ${activeWork.title}` : ""}` : discussion ? "讨论状态机" : "（无）"}

## 下一步
${discussion ? `按讨论状态机推进 ${discussion.phase}` : activeWork ? `${activeWork.id} ${activeWork.title}` : activeBench ? `按状态机推进 ${activeBench.id}` : "（无）"}

## 继续工作时加载
${loadRefs.length > 0 ? loadRefs.map((ref) => `- ${ref}`).join("\n") : "（无）"}

## 挂起提醒
${[...benchmarks.filter((item) => item.hold).map((item) => `- ${item.id} ${item.hold?.reason}`), ...works.filter((item) => item.hold).map((item) => `- ${item.id} ${item.hold?.reason}`)].join("\n") || "（无）"}
`;
  await writeTextAtomic(PATHS.current, current);
  await writeTextAtomic(PATHS.stateSummary, JSON.stringify({ benchmarks, workItems: works, discussion }, null, 2) + "\n");

  const events = await readMachineEvents();
  const audit = ["# 审计日志", "", "> 本文件由 workflow-agent 生成，请勿直接编辑。", "", "| 时间 | 对象 | 事件 | 原因 |", "|---|---|---|---|"];
  for (const event of events) audit.push(`| ${event.timestamp} | ${event.aggregate}:${event.aggregateId} | ${event.type} | ${(event.reason ?? "-").replaceAll("|", "／")} |`);
  await writeTextAtomic(PATHS.audit, audit.join("\n") + "\n");
}

async function readStates<T>(root: string): Promise<T[]> {
  if (!(await exists(root))) return [];
  const files = (await readdir(root)).filter((name) => name.endsWith(".json")).sort();
  return Promise.all(files.map(async (file) => await readJson(join(root, file)) as T));
}

async function readState<T>(root: string, id: string): Promise<T | null> {
  const path = join(root, `${id}.json`);
  return await exists(path) ? await readJson(path) as T : null;
}
