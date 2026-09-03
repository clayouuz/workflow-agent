import type { HoldState } from "./benchmark-machine.ts";

export type WorkItemPhase = "pending" | "active" | "done" | "obsolete";

export interface WorkItemMachineState {
  id: string;
  title: string;
  reference: string;
  phase: WorkItemPhase;
  hold: HoldState | null;
  documentDigest: string;
  benchmarks: string[];
}

export function requireWorkItemPhase(state: WorkItemMachineState, allowed: WorkItemPhase[], action: string): void {
  if (state.hold) throw new Error(`${state.id} 已 blocked，不能执行 ${action}`);
  if (!allowed.includes(state.phase)) throw new Error(`${state.id} 当前状态 ${state.phase}，不能执行 ${action}`);
}

