export type BenchmarkPhase = "draft" | "ready" | "verifying" | "awaiting_manual_review" | "accepted" | "accepted_with_risk" | "reopened" | "obsolete";

export interface HoldState { reason: string; resumeWhen?: string }

export interface BenchmarkMachineState {
  id: string;
  title: string;
  reference: string;
  phase: BenchmarkPhase;
  hold: HoldState | null;
  contractDigest: string;
  verificationStatus: "valid" | "failed" | "stale" | "incomplete" | null;
  replacedBy?: string;
}

export function requireBenchmarkPhase(state: BenchmarkMachineState, allowed: BenchmarkPhase[], action: string): void {
  if (state.hold) throw new Error(`${state.id} 已 blocked，不能执行 ${action}`);
  if (!allowed.includes(state.phase)) throw new Error(`${state.id} 当前状态 ${state.phase}，不能执行 ${action}`);
}

export function benchmarkDrift(state: BenchmarkMachineState, digest: string): boolean {
  return state.contractDigest !== digest;
}

