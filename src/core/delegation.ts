import { resolve, sep } from "node:path";
import { digest } from "./workspace-schema.ts";
import { exists, readJson, readText, writeTextAtomic } from "./fs.ts";

export type DelegationPhase =
  | "boundary_confirmed"
  | "solution_discussed"
  | "solution_confirmed"
  | "code_design_discussed"
  | "code_design_confirmed"
  | "combined_design_discussed"
  | "combined_design_confirmed"
  | "implementation_permitted";

export type DesignKind = "solution" | "code" | "combined";

export interface DesignEvidence {
  reference: string;
  digest: string;
  confirmation?: string;
  confirmedDigest?: string;
}

export interface DelegationState {
  version: 1;
  phase: DelegationPhase;
  boundaryConfirmation: string;
  solution?: DesignEvidence;
  code?: DesignEvidence;
  combined?: DesignEvidence;
}

export function initialDelegationState(boundaryConfirmation: string): DelegationState {
  return { version: 1, phase: "boundary_confirmed", boundaryConfirmation };
}

export function isDelegatedAuthority(text: string): boolean {
  const section = text.match(/(?:^|\n)##\s+审批委托\s*\n([\s\S]*?)(?=\n##\s|$)/)?.[1] ?? "";
  return /(?:^|\n)-\s*状态：已委托(?:\s|$)/.test(section);
}

export async function readDelegationState(path: string): Promise<DelegationState | null> {
  if (!(await exists(path))) return null;
  const value = await readJson(path) as Partial<DelegationState>;
  const phases: DelegationPhase[] = [
    "boundary_confirmed", "solution_discussed", "solution_confirmed", "code_design_discussed",
    "code_design_confirmed", "combined_design_discussed", "combined_design_confirmed", "implementation_permitted",
  ];
  if (value.version !== 1 || !phases.includes(value.phase as DelegationPhase) || typeof value.boundaryConfirmation !== "string") {
    throw new Error("delegation-state.json 格式无效");
  }
  return value as DelegationState;
}

export async function writeDelegationState(path: string, state: DelegationState): Promise<void> {
  await writeTextAtomic(path, JSON.stringify(state, null, 2) + "\n");
}

export async function discussDesign(
  state: DelegationState,
  kind: DesignKind,
  reference: string,
  ledgerDir: string,
): Promise<DelegationState> {
  requireDiscussionPhase(state.phase, kind);
  const evidence = await designEvidence(reference, ledgerDir);
  if (kind === "solution") return { ...state, phase: "solution_discussed", solution: evidence, code: undefined, combined: undefined };
  if (kind === "code") return { ...state, phase: "code_design_discussed", code: evidence, combined: undefined };
  return { ...state, phase: "combined_design_discussed", combined: evidence, solution: undefined, code: undefined };
}

export async function confirmDesign(
  state: DelegationState,
  kind: DesignKind,
  confirmation: string,
  ledgerDir: string,
): Promise<DelegationState> {
  if (!confirmation.trim()) throw new Error("用户确认原文不能为空");
  const expected = kind === "solution" ? "solution_discussed" : kind === "code" ? "code_design_discussed" : "combined_design_discussed";
  if (state.phase !== expected) throw new Error(`当前状态 ${state.phase}，不能确认 ${kind}`);
  const evidence = state[kind];
  if (!evidence) throw new Error(`${kind} 缺少讨论证据`);
  const currentDigest = await designDigest(evidence.reference, ledgerDir);
  if (currentDigest !== evidence.digest) throw new Error(`${kind} 设计内容已变化，请重新记录讨论后再确认`);
  const confirmed = { ...evidence, digest: currentDigest, confirmation: confirmation.trim(), confirmedDigest: currentDigest };
  const phase = kind === "solution" ? "solution_confirmed" : kind === "code" ? "code_design_confirmed" : "combined_design_confirmed";
  return { ...state, phase, [kind]: confirmed } as DelegationState;
}

export async function permitImplementation(state: DelegationState, ledgerDir: string): Promise<DelegationState> {
  if (state.phase === "code_design_confirmed") {
    const changed = await firstChanged(state, ["solution", "code"], ledgerDir);
    if (changed) throw changed.error;
    return { ...state, phase: "implementation_permitted" };
  }
  if (state.phase === "combined_design_confirmed") {
    const changed = await firstChanged(state, ["combined"], ledgerDir);
    if (changed) throw changed.error;
    return { ...state, phase: "implementation_permitted" };
  }
  throw new Error(`当前状态 ${state.phase}，不能取得实现许可`);
}

export async function regressChangedDesign(
  state: DelegationState,
  ledgerDir: string,
): Promise<DelegationState | null> {
  const kinds: DesignKind[] = state.combined ? ["combined"] : ["solution", "code"];
  for (const kind of kinds) {
    const evidence = state[kind];
    if (!evidence?.confirmedDigest) continue;
    const currentDigest = await designDigest(evidence.reference, ledgerDir);
    if (currentDigest === evidence.confirmedDigest) continue;
    const phase = kind === "solution" ? "solution_discussed" : kind === "code" ? "code_design_discussed" : "combined_design_discussed";
    return {
      ...state,
      phase,
      [kind]: { reference: evidence.reference, digest: currentDigest },
      ...(kind === "solution" ? { code: undefined } : {}),
    } as DelegationState;
  }
  return null;
}

async function firstChanged(state: DelegationState, kinds: DesignKind[], ledgerDir: string) {
  for (const kind of kinds) {
    const evidence = state[kind];
    if (!evidence?.confirmedDigest) return { error: new Error(`${kind} 缺少用户确认`) };
    if (await designDigest(evidence.reference, ledgerDir) !== evidence.confirmedDigest) {
      return { error: new Error(`${kind} 设计内容已变化，旧确认失效`) };
    }
  }
  return null;
}

function requireDiscussionPhase(phase: DelegationPhase, kind: DesignKind): void {
  const allowed = kind === "solution"
    ? ["boundary_confirmed", "solution_discussed"]
    : kind === "code"
      ? ["solution_confirmed", "code_design_discussed"]
      : ["boundary_confirmed", "combined_design_discussed"];
  if (!allowed.includes(phase)) throw new Error(`当前状态 ${phase}，不能讨论 ${kind}`);
}

async function designEvidence(reference: string, ledgerDir: string): Promise<DesignEvidence> {
  return { reference, digest: await designDigest(reference, ledgerDir) };
}

async function designDigest(reference: string, ledgerDir: string): Promise<string> {
  const normalized = reference.replaceAll("\\", "/").replace(/^ledger\//, "");
  if (!normalized.startsWith("designs/") || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`设计引用必须位于 ledger/designs/: ${reference}`);
  }
  const root = resolve(ledgerDir);
  const path = resolve(root, ...normalized.split("/"));
  if (!path.startsWith(`${root}${sep}`) || !(await exists(path))) throw new Error(`设计文件不存在: ${reference}`);
  const content = await readText(path);
  if (!content.trim()) throw new Error(`设计文件为空: ${reference}`);
  return digest(content);
}
