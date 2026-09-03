import { appendMachineEvent, writeAggregateState } from "../core/machine-events.ts";
import { benchmarkDrift, requireBenchmarkPhase, type BenchmarkMachineState } from "../core/benchmark-machine.ts";
import { readBenchmarkContract } from "../core/semantic-documents.ts";
import { projectWorkflow, readBenchmarkState, readWorkItemStates } from "../core/projections.ts";
import { evaluateVerification, readVerificationRecord, writeVerificationRecord } from "../core/verification.ts";

export async function ledgerBenchmark(args: string[]): Promise<void> {
  const [action, id, ...rest] = args;
  if (!action) throw new Error("用法: ledger benchmark register|status|ready|verify|request-review|accept|accept-risk|block|resume|reopen|obsolete ...");
  if (action === "status") return await status(id);
  if (!id) throw new Error(`benchmark ${action} 缺少 Bid`);
  if (action === "register") return await register(id, rest[0]);
  const state = await readBenchmarkState(id);
  const contract = await readBenchmarkContract(id, state.reference);
  if (action !== "reopen" && benchmarkDrift(state, contract.digest)) throw new Error(`${id} contract-drift：语义文档已变化，请先 reopen`);

  switch (action) {
    case "ready":
      requireBenchmarkPhase(state, ["draft", "reopened"], action);
      if (!contract.ready) throw new Error(`${id} Contract 缺少必需章节或 Acceptance`);
      return await commit({ ...state, title: contract.title, phase: "ready", contractDigest: contract.digest, verificationStatus: null }, "benchmark_ready");
    case "verify":
      requireBenchmarkPhase(state, ["ready", "reopened"], action);
      await requireWorkItemsDone(id);
      return await commit({ ...state, phase: "verifying", verificationStatus: "incomplete" }, "verification_started");
    case "request-review":
      requireBenchmarkPhase(state, ["verifying"], action);
      if (!contract.acceptance.some((item) => item.mode === "manual")) throw new Error(`${id} 没有 manual Acceptance`);
      return await commit({ ...state, phase: "awaiting_manual_review" }, "manual_review_requested");
    case "accept":
      requireBenchmarkPhase(state, ["verifying", "awaiting_manual_review"], action);
      await requireWorkItemsDone(id);
      return await accept(state, contract);
    case "accept-risk": {
      requireBenchmarkPhase(state, ["verifying", "awaiting_manual_review"], action);
      const reason = rest.join(" ").trim();
      if (!reason) throw new Error("accept-risk 必须提供用户明确风险接受依据");
      return await commit({ ...state, phase: "accepted_with_risk" }, "benchmark_accepted_with_risk", reason);
    }
    case "block": {
      if (state.hold) throw new Error(`${id} 已 blocked`);
      const { reason, resumeWhen } = blockArgs(rest);
      return await commit({ ...state, hold: { reason, ...(resumeWhen ? { resumeWhen } : {}) } }, "benchmark_blocked", reason);
    }
    case "resume":
      if (!state.hold) throw new Error(`${id} 未 blocked`);
      return await commit({ ...state, hold: null }, "benchmark_resumed", rest.join(" ").trim() || undefined);
    case "reopen": {
      if (!["accepted", "accepted_with_risk", "ready", "verifying", "awaiting_manual_review", "reopened"].includes(state.phase)) throw new Error(`${id} 当前状态 ${state.phase} 不能 reopen`);
      const reason = rest.join(" ").trim();
      if (!reason) throw new Error("reopen 必须提供原因");
      return await commit({ ...state, phase: "reopened", hold: null, contractDigest: contract.digest, verificationStatus: "stale" }, "benchmark_reopened", reason);
    }
    case "obsolete": {
      const reason = rest.join(" ").trim();
      if (!reason) throw new Error("obsolete 必须提供原因");
      return await commit({ ...state, phase: "obsolete", hold: null }, "benchmark_obsolete", reason);
    }
    default: throw new Error(`未知 benchmark 命令: ${action}`);
  }
}

async function register(id: string, reference?: string): Promise<void> {
  try { await readBenchmarkState(id); throw new Error(`Benchmark 已注册: ${id}`); } catch (error) { if (error instanceof Error && !/未注册/.test(error.message)) throw error; }
  const contract = await readBenchmarkContract(id, reference);
  await commit({ id, title: contract.title, reference: contract.reference, phase: "draft", hold: null, contractDigest: contract.digest, verificationStatus: null }, "benchmark_registered");
}

async function status(id?: string): Promise<void> {
  if (!id) { await projectWorkflow(); console.log("Benchmark 投影已刷新"); return; }
  const state = await readBenchmarkState(id);
  const contract = await readBenchmarkContract(id, state.reference);
  console.log(`${id}\t${state.phase}\t${state.hold ? "blocked" : "active"}\t${benchmarkDrift(state, contract.digest) ? "contract-drift" : "contract-valid"}\tverification=${state.verificationStatus ?? "none"}`);
}

async function accept(state: BenchmarkMachineState, contract: Awaited<ReturnType<typeof readBenchmarkContract>>): Promise<void> {
  const record = await readVerificationRecord(state.id);
  if (!record) throw new Error(`${state.id} 缺少验证证据`);
  const bench = { id: state.id, title: state.title, status: "in_progress" as const, acceptanceItems: contract.acceptance.map((item) => ({ ...item, done: false })), steps: [] };
  await evaluateVerification(record, bench);
  await writeVerificationRecord(record);
  if (record.status !== "valid") throw new Error(`${state.id} 验证状态为 ${record.status}`);
  await commit({ ...state, phase: "accepted", verificationStatus: "valid" }, "benchmark_accepted");
}

async function requireWorkItemsDone(bid: string): Promise<void> {
  for (const work of (await readWorkItemStates()).filter((item) => item.benchmarks.includes(bid))) {
    if (work.phase !== "done" || work.hold) throw new Error(`${bid} 依赖 Work Item ${work.id} 尚未完成`);
    const document = await import("../core/semantic-documents.ts").then((mod) => mod.readWorkItemDocument(work.id, work.reference));
    if (document.digest !== work.documentDigest) throw new Error(`${bid} 依赖 Work Item ${work.id} content-stale`);
  }
}

async function commit(state: BenchmarkMachineState, type: string, reason?: string): Promise<void> {
  await appendMachineEvent({ aggregate: "benchmark", aggregateId: state.id, type, state, ...(reason ? { reason } : {}) });
  await writeAggregateState("benchmark", state.id, state);
  await projectWorkflow();
  console.log(`${state.id}: ${state.phase}${state.hold ? "/blocked" : ""}`);
}

function blockArgs(args: string[]): { reason: string; resumeWhen?: string } {
  const index = args.indexOf("--resume-when");
  const reason = (index >= 0 ? args.slice(0, index) : args).join(" ").trim();
  const resumeWhen = index >= 0 ? args.slice(index + 1).join(" ").trim() : undefined;
  if (!reason) throw new Error("block 必须提供原因");
  if (index >= 0 && !resumeWhen) throw new Error("--resume-when 后必须提供条件");
  return { reason, ...(resumeWhen ? { resumeWhen } : {}) };
}

