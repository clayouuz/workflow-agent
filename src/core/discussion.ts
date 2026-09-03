import { resolve, sep } from "node:path";
import { digest } from "./workspace-schema.ts";
import { exists, readJson, readText, writeTextAtomic } from "./fs.ts";

export type DiscussionKind = "target" | "plan" | "acceptance" | "combined";
export type DiscussionPhase =
  | "target_pending" | "target_discussed" | "target_confirmed"
  | "plan_discussed" | "plan_confirmed"
  | "acceptance_discussed" | "acceptance_confirmed"
  | "combined_discussed" | "combined_confirmed"
  | "execution_permitted";

export interface DiscussionEvidence {
  reference: string;
  digest: string;
  confirmation?: string;
  confirmedDigest?: string;
}

export interface DiscussionState {
  version: 1;
  mode: "managed";
  complexityReason: string;
  phase: DiscussionPhase;
  target?: DiscussionEvidence;
  plan?: DiscussionEvidence;
  acceptance?: DiscussionEvidence;
  combined?: DiscussionEvidence;
}

export function discussionReferences(state: DiscussionState): string[] {
  const refs = ["ledger/discussion-state.json"];
  for (const kind of ["target", "plan", "acceptance", "combined"] as const) {
    const reference = state[kind]?.reference;
    if (reference) refs.push(reference);
  }
  return [...new Set(refs)];
}

export function initialDiscussionState(complexityReason: string): DiscussionState {
  if (!complexityReason.trim()) throw new Error("复杂度判断依据不能为空");
  return { version: 1, mode: "managed", complexityReason: complexityReason.trim(), phase: "target_pending" };
}

export async function readDiscussionState(path: string): Promise<DiscussionState | null> {
  if (!(await exists(path))) return null;
  const value = await readJson(path) as Partial<DiscussionState>;
  const phases: DiscussionPhase[] = [
    "target_pending", "target_discussed", "target_confirmed", "plan_discussed", "plan_confirmed",
    "acceptance_discussed", "acceptance_confirmed", "combined_discussed", "combined_confirmed", "execution_permitted",
  ];
  if (value.version !== 1 || value.mode !== "managed" || typeof value.complexityReason !== "string" || !phases.includes(value.phase as DiscussionPhase)) {
    throw new Error("discussion-state.json 格式无效");
  }
  return value as DiscussionState;
}

export async function writeDiscussionState(path: string, state: DiscussionState): Promise<void> {
  await writeTextAtomic(path, JSON.stringify(state, null, 2) + "\n");
}

export async function discussDesign(state: DiscussionState, kind: DiscussionKind, reference: string, ledgerDir: string): Promise<DiscussionState> {
  requireDiscussionPhase(state.phase, kind);
  const evidence = await designEvidence(reference, ledgerDir);
  if (kind === "target") return { ...state, phase: "target_discussed", target: evidence, plan: undefined, acceptance: undefined, combined: undefined };
  if (kind === "plan") return { ...state, phase: "plan_discussed", plan: evidence, acceptance: undefined, combined: undefined };
  if (kind === "acceptance") return { ...state, phase: "acceptance_discussed", acceptance: evidence, combined: undefined };
  return { ...state, phase: "combined_discussed", combined: evidence, target: undefined, plan: undefined, acceptance: undefined };
}

export async function confirmDesign(state: DiscussionState, kind: DiscussionKind, confirmation: string, ledgerDir: string): Promise<DiscussionState> {
  if (!confirmation.trim()) throw new Error("用户确认原文不能为空");
  const expected = kind === "target" ? "target_discussed" : kind === "plan" ? "plan_discussed" : kind === "acceptance" ? "acceptance_discussed" : "combined_discussed";
  if (state.phase !== expected) throw new Error(`当前状态 ${state.phase}，不能确认 ${kind}`);
  const evidence = state[kind];
  if (!evidence) throw new Error(`${kind} 缺少讨论证据`);
  const currentDigest = await designDigest(evidence.reference, ledgerDir);
  if (currentDigest !== evidence.digest) throw new Error(`${kind} 设计内容已变化，请重新记录讨论后再确认`);
  const confirmed = { ...evidence, digest: currentDigest, confirmation: confirmation.trim(), confirmedDigest: currentDigest };
  const phase = kind === "target" ? "target_confirmed" : kind === "plan" ? "plan_confirmed" : kind === "acceptance" ? "acceptance_confirmed" : "combined_confirmed";
  return { ...state, phase, [kind]: confirmed } as DiscussionState;
}

export async function permitExecution(state: DiscussionState, ledgerDir: string): Promise<DiscussionState> {
  const kinds: DiscussionKind[] = state.combined ? ["combined"] : ["target", "plan", "acceptance"];
  const expected = state.combined ? "combined_confirmed" : "acceptance_confirmed";
  if (state.phase !== expected) throw new Error(`当前状态 ${state.phase}，不能取得执行许可`);
  for (const kind of kinds) {
    const evidence = state[kind];
    if (!evidence?.confirmedDigest) throw new Error(`${kind} 缺少用户确认`);
    if (await designDigest(evidence.reference, ledgerDir) !== evidence.confirmedDigest) throw new Error(`${kind} 设计内容已变化，旧确认失效`);
  }
  return { ...state, phase: "execution_permitted" };
}

export async function regressChangedDiscussion(state: DiscussionState, ledgerDir: string): Promise<DiscussionState | null> {
  const kinds: DiscussionKind[] = state.combined ? ["combined"] : ["target", "plan", "acceptance"];
  for (const kind of kinds) {
    const evidence = state[kind];
    if (!evidence?.confirmedDigest) continue;
    const currentDigest = await designDigest(evidence.reference, ledgerDir);
    if (currentDigest === evidence.confirmedDigest) continue;
    const phase = kind === "target" ? "target_discussed" : kind === "plan" ? "plan_discussed" : kind === "acceptance" ? "acceptance_discussed" : "combined_discussed";
    return { ...state, phase, [kind]: { reference: evidence.reference, digest: currentDigest }, ...(kind === "target" ? { plan: undefined, acceptance: undefined } : kind === "plan" ? { acceptance: undefined } : {}) } as DiscussionState;
  }
  return null;
}

function requireDiscussionPhase(phase: DiscussionPhase, kind: DiscussionKind): void {
  const allowed = kind === "target" ? ["target_pending", "target_discussed"] : kind === "plan" ? ["target_confirmed", "plan_discussed"] : kind === "acceptance" ? ["plan_confirmed", "acceptance_discussed"] : ["target_pending", "combined_discussed"];
  if (!allowed.includes(phase)) throw new Error(`当前状态 ${phase}，不能讨论 ${kind}`);
}

async function designEvidence(reference: string, ledgerDir: string): Promise<DiscussionEvidence> {
  return { reference, digest: await designDigest(reference, ledgerDir) };
}

async function designDigest(reference: string, ledgerDir: string): Promise<string> {
  const normalized = reference.replaceAll("\\", "/").replace(/^ledger\//, "");
  if (!normalized.startsWith("designs/") || normalized.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`讨论文档引用必须位于 ledger/designs/: ${reference}`);
  const root = resolve(ledgerDir);
  const path = resolve(root, ...normalized.split("/"));
  if (!path.startsWith(`${root}${sep}`) || !(await exists(path))) throw new Error(`讨论文档不存在: ${reference}`);
  const content = await readText(path);
  if (!content.trim()) throw new Error(`讨论文档为空: ${reference}`);
  for (const heading of ["目标", "具体方案", "验收方式"]) if (!content.match(new RegExp(`^##\\s+${heading}\\s*$`, "m"))) throw new Error(`讨论文档缺少“${heading}”章节`);
  return digest(content);
}
