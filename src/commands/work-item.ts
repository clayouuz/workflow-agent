import { appendMachineEvent, writeAggregateState } from "../core/machine-events.ts";
import { requireWorkItemPhase, type WorkItemMachineState } from "../core/work-item-machine.ts";
import { readWorkItemDocument } from "../core/semantic-documents.ts";
import { projectWorkflow, readWorkItemState } from "../core/projections.ts";

export async function ledgerWorkItem(args: string[]): Promise<void> {
  const [action, id, ...rest] = args;
  if (!action) throw new Error("用法: ledger work register|status|start|done|block|resume|reopen|obsolete ...");
  if (action === "status") return await status(id);
  if (!id) throw new Error(`work ${action} 缺少 Wid`);
  if (action === "register") return await register(id, rest);
  const state = await readWorkItemState(id);
  const document = await readWorkItemDocument(id, state.reference);
  if (action !== "reopen" && state.documentDigest !== document.digest) throw new Error(`${id} content-stale：语义文档已变化，请先 reopen`);
  switch (action) {
    case "start": requireWorkItemPhase(state, ["pending"], action); return await commit({ ...state, phase: "active" }, "work_item_started");
    case "done": requireWorkItemPhase(state, ["active"], action); return await commit({ ...state, phase: "done", documentDigest: document.digest }, "work_item_completed");
    case "block": {
      if (state.hold) throw new Error(`${id} 已 blocked`);
      const index = rest.indexOf("--resume-when");
      const reason = (index >= 0 ? rest.slice(0, index) : rest).join(" ").trim();
      const resumeWhen = index >= 0 ? rest.slice(index + 1).join(" ").trim() : undefined;
      if (!reason || (index >= 0 && !resumeWhen)) throw new Error("block 必须提供原因和有效恢复条件");
      return await commit({ ...state, hold: { reason, ...(resumeWhen ? { resumeWhen } : {}) } }, "work_item_blocked", reason);
    }
    case "resume": if (!state.hold) throw new Error(`${id} 未 blocked`); return await commit({ ...state, hold: null }, "work_item_resumed", rest.join(" ").trim() || undefined);
    case "reopen": {
      const reason = rest.join(" ").trim(); if (!reason) throw new Error("reopen 必须提供原因");
      return await commit({ ...state, phase: "active", hold: null, documentDigest: document.digest }, "work_item_reopened", reason);
    }
    case "obsolete": {
      const reason = rest.join(" ").trim(); if (!reason) throw new Error("obsolete 必须提供原因");
      return await commit({ ...state, phase: "obsolete", hold: null }, "work_item_obsolete", reason);
    }
    default: throw new Error(`未知 work 命令: ${action}`);
  }
}

async function register(id: string, args: string[]): Promise<void> {
  const reference = args[0];
  const benchmarks: string[] = [];
  for (let index = 1; index < args.length; index++) {
    if (args[index] !== "--benchmark" || !args[index + 1]) throw new Error("register 用法: <Wid> <文档> [--benchmark <Bid>]...");
    benchmarks.push(args[++index]);
  }
  const document = await readWorkItemDocument(id, reference);
  const state: WorkItemMachineState = { id, title: document.title, reference: document.reference, phase: "pending", hold: null, documentDigest: document.digest, benchmarks: [...new Set(benchmarks)] };
  await commit(state, "work_item_registered");
}

async function status(id?: string): Promise<void> {
  if (!id) { await projectWorkflow(); console.log("Work Item 投影已刷新"); return; }
  const state = await readWorkItemState(id);
  const document = await readWorkItemDocument(id, state.reference);
  console.log(`${id}\t${state.phase}\t${state.hold ? "blocked" : "active"}\t${state.documentDigest === document.digest ? "content-valid" : "content-stale"}`);
}

async function commit(state: WorkItemMachineState, type: string, reason?: string): Promise<void> {
  await appendMachineEvent({ aggregate: "work_item", aggregateId: state.id, type, state, ...(reason ? { reason } : {}) });
  await writeAggregateState("work_item", state.id, state);
  await projectWorkflow();
  console.log(`${state.id}: ${state.phase}${state.hold ? "/blocked" : ""}`);
}

