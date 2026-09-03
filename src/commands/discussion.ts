import { appendMachineEvent } from "../core/machine-events.ts";
import { parseCurrent, renderCurrent } from "../core/current.ts";
import { exists, readText, writeTextAtomic } from "../core/fs.ts";
import { PATHS } from "../core/workspace.ts";
import {
  confirmDesign,
  discussDesign,
  initialDiscussionState,
  permitExecution,
  discussionReferences,
  readDiscussionState,
  regressChangedDiscussion,
  writeDiscussionState,
  type DiscussionKind,
  type DiscussionState,
} from "../core/discussion.ts";

export async function ledgerDiscussion(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (sub === "init") {
    if (await readDiscussionState(PATHS.discussionState)) throw new Error("当前任务已启用讨论状态机");
    const state = initialDiscussionState(rest.join(" "));
    await saveState(state, "discussion_initialized | LLM 判断任务复杂");
    console.log("讨论状态机已启用: target_pending");
    return;
  }
  const current = await requireState();
  if (sub === "status") {
    console.log(`讨论阶段: ${current.phase}`);
    console.log(`复杂度判断依据: ${current.complexityReason}`);
    return;
  }
  if (sub === "discuss") {
    const [rawKind, reference] = rest;
    const kind = requireKind(rawKind);
    if (!reference) throw new Error("用法: ledger discussion discuss target|plan|acceptance|combined <设计文件>");
    await saveState(await discussDesign(current, kind, reference, PATHS.ledger), `discuss_${kind} | ${reference}`);
    console.log(`已记录 ${kind} 讨论: ${(await readDiscussionState(PATHS.discussionState))?.phase}`);
    return;
  }
  if (sub === "confirm") {
    const [rawKind, ...parts] = rest;
    const kind = requireKind(rawKind);
    await saveState(await confirmDesign(current, kind, parts.join(" "), PATHS.ledger), `confirm_${kind} | ${parts.join(" ")}`);
    console.log(`已记录用户确认: ${(await readDiscussionState(PATHS.discussionState))?.phase}`);
    return;
  }
  if (sub === "permit") {
    const regressed = await regressChangedDiscussion(current, PATHS.ledger);
    if (regressed) {
      await saveState(regressed, `design_changed | ${current.phase} -> ${regressed.phase}`);
      throw new Error(`设计内容已变化，旧确认失效；当前状态 ${regressed.phase}`);
    }
    await saveState(await permitExecution(current, PATHS.ledger), "execution_permitted | 三项确认链有效");
    console.log("已取得执行许可: execution_permitted");
    return;
  }
  throw new Error("未知 discussion 命令。可用: init | discuss | confirm | permit | status");
}

async function requireState(): Promise<DiscussionState> {
  const state = await readDiscussionState(PATHS.discussionState);
  if (!state) throw new Error("当前任务未启用讨论状态机");
  return state;
}

function requireKind(value: string | undefined): DiscussionKind {
  if (value === "target" || value === "plan" || value === "acceptance" || value === "combined") return value;
  throw new Error("讨论类型必须是 target、plan、acceptance 或 combined");
}

async function saveState(state: DiscussionState, reason: string): Promise<void> {
  await appendMachineEvent({ aggregate: "discussion", aggregateId: "current", type: "discussion_phase_changed", state, reason });
  await writeDiscussionState(PATHS.discussionState, state);
  if (await exists(PATHS.current)) {
    const current = parseCurrent(await readText(PATHS.current));
    current.stage = `讨论：${state.phase}`;
    current.next = nextStep(state.phase);
    current.loadRefs = [...new Set([...current.loadRefs, ...discussionReferences(state)])];
    await writeTextAtomic(PATHS.current, renderCurrent(current));
  }
}

function nextStep(phase: DiscussionState["phase"]): string {
  const next: Record<DiscussionState["phase"], string> = {
    target_pending: "编写并展示目标，记录目标讨论。",
    target_discussed: "等待用户确认目标。",
    target_confirmed: "编写并展示具体方案，记录方案讨论。",
    plan_discussed: "等待用户确认具体方案。",
    plan_confirmed: "编写并展示验收方式，记录验收讨论。",
    acceptance_discussed: "等待用户确认验收方式。",
    acceptance_confirmed: "检查三项确认并取得执行许可。",
    combined_discussed: "等待用户确认合并设计。",
    combined_confirmed: "检查合并设计确认并取得执行许可。",
    execution_permitted: "开始执行并按验收方式验证。",
  };
  return next[phase];
}
