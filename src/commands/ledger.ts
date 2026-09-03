import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { exists, readText, readJson, writeText, writeTextAtomic, appendText, moveFile, today } from "../core/fs.ts";
import {
  WORKSPACE,
  PATHS,
  DEFAULT_TASK_ID,
  listTaskIds,
  readActiveTaskId,
  writeActiveTaskId,
  taskLedgerDir,
  taskExists,
} from "../core/workspace.ts";
import { workspaceFiles } from "../core/templates.ts";
import {
  BENCHMARK_STATUSES,
  findBench,
  findRunnableStep,
  findStep,
  parseBenchmarks,
  updateBenchmarkStatus as updateBenchmarkStatusText,
  updateStepState,
  markAcceptanceItemsDone,
} from "../core/benchmarks.ts";
import type { Bench, BenchmarkStatus, StepState } from "../core/benchmarks.ts";
import { parseCurrent, renderCurrent } from "../core/current.ts";
import type { SuspendedSummary } from "../core/current.ts";
import { appendHistoryEvent, readHistoryEvents } from "../core/history.ts";
import { validateSnapshotDraft } from "../core/snapshot-schema.ts";
import { loadReference } from "../core/context.ts";
import { evaluateVerification, readVerificationRecord, writeVerificationRecord } from "../core/verification.ts";
import {
  initializeWorkspaceSchema,
  migrateWorkspace,
  restoreArchivedWorkspaceFile,
  workspaceRequiresMigration,
} from "../core/migration.ts";
import {
  confirmDesign,
  discussDesign,
  initialDelegationState,
  isDelegatedAuthority,
  permitImplementation,
  readDelegationState,
  regressChangedDesign,
  writeDelegationState,
  type DesignKind,
  type DelegationState,
} from "../core/delegation.ts";
import { discussionReferences, readDiscussionState } from "../core/discussion.ts";
import { projectWorkflow, rebuildStateFromEvents, readBenchmarkStates, readWorkItemStates } from "../core/projections.ts";

export async function ledgerInit(): Promise<void> {
  if (await workspaceRequiresMigration(WORKSPACE)) {
    throw new Error("检测到没有结构清单的旧工作区，请先执行 ledger migrate");
  }
  let created = 0;
  let skipped = 0;
  // 共享模板（discussion / heuristics / tools / tests）写到工作区根
  for (const [rel, content] of workspaceFiles) {
    if (rel.startsWith("ledger/")) continue;
    const target = join(WORKSPACE, rel);
    if (await exists(target)) {
      skipped++;
      continue;
    }
    await writeText(target, content);
    created++;
  }

  // 确定当前任务并写入该任务的台账模板
  const existing = listTaskIds();
  let taskId = readActiveTaskId();
  if (!existing.includes(taskId)) {
    taskId = existing.length > 0 ? existing[0] : DEFAULT_TASK_ID;
  }
  const ledgerResult = await writeLedgerTemplates(taskLedgerDir(taskId));
  created += ledgerResult.created;
  skipped += ledgerResult.skipped;
  writeActiveTaskId(taskId);
  await initializeWorkspaceSchema(WORKSPACE);

  console.log(`工作区初始化完成: ${WORKSPACE}`);
  console.log(`共享目录: discussion / heuristics / tools / tests`);
  console.log(`当前任务: ${taskId}（台账目录: .workflow/tasks/${taskId}/ledger/）`);
  console.log(`新建 ${created} 个文件，跳过已存在 ${skipped} 个。`);
  console.log(`下一步: node src\\cli.ts ledger show`);
}

export async function ledgerMigrate(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (sub === "restore") {
    const originalPath = rest.join(" ").trim();
    if (!originalPath) throw new Error("用法: ledger migrate restore <原路径>");
    const restored = await restoreArchivedWorkspaceFile(WORKSPACE, originalPath);
    console.log(`归档已恢复: ${restored}`);
    return;
  }
  if (sub) throw new Error(`未知 migrate 操作: ${sub}。可用: ledger migrate | ledger migrate restore <原路径>`);

  const result = await migrateWorkspace(WORKSPACE);
  if (result.alreadyCurrent) {
    console.log(`工作区已是 v${result.toVersion}，无需迁移。`);
    return;
  }
  console.log(`迁移完成: v${result.fromVersion} -> v${result.toVersion}`);
  console.log(
    `更新 ${result.updated}，新增 ${result.created}，保留 ${result.preserved}，候选 ${result.candidates}，归档 ${result.archived}。`,
  );
  if (result.candidates > 0) console.log("自定义文件未被覆盖；新版候选位于 migration/candidates/。");
  if (result.archived > 0) console.log("废弃文件位于 migration/archive/，可用 ledger migrate restore <原路径> 恢复。");
}

export async function ledgerTaskNew(args: string[]): Promise<void> {
  if (await workspaceRequiresMigration(WORKSPACE)) {
    throw new Error("检测到旧版本工作区，请先执行 ledger migrate");
  }
  const name = sanitizeTaskName(args.join("-") || "默认");
  const nums = listTaskIds()
    .map(taskNumber)
    .filter((n): n is number => n !== null);
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  const id = `T${next}-${name}`;
  if (taskExists(id)) throw new Error(`任务已存在: ${id}`);
  const { created } = await writeLedgerTemplates(taskLedgerDir(id));
  writeActiveTaskId(id);
  console.log(`已创建并绑定任务: ${id}（新建 ${created} 个台账文件）`);
}

export async function ledgerTaskBind(args: string[]): Promise<void> {
  const [id] = args;
  if (!id) throw new Error("用法: ledger task bind <任务id>");
  if (!taskExists(id)) {
    throw new Error(`任务不存在: ${id}。可用: ${listTaskIds().join(", ") || "(无)"}`);
  }
  writeActiveTaskId(id);
  console.log(`已绑定任务: ${id}`);
}

export async function ledgerTaskList(): Promise<void> {
  const active = readActiveTaskId();
  const ids = listTaskIds();
  if (ids.length === 0) {
    console.log("暂无任务，请先 ledger init 或 ledger task new <名称>");
    return;
  }
  for (const id of ids) {
    console.log(`${id === active ? "*" : " "} ${id}`);
  }
}

export async function ledgerDelegation(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  await ensureWorkspace();
  if (sub === "enable") {
    const basis = rest.join(" ").trim();
    if (!basis) throw new Error("用法: ledger delegation enable <边界确认依据>");
    if (!isDelegatedAuthority(await readText(PATHS.authority))) {
      throw new Error("当前任务 authority 未记录“状态：已委托”");
    }
    if (await readDelegationState(PATHS.delegationState)) throw new Error("当前任务已启用委托状态机");
    const state = initialDelegationState(basis);
    await saveDelegationState(state, `enable | ${basis}`);
    console.log("委托状态机已启用: boundary_confirmed");
    return;
  }

  if (sub === "status") {
    const state = await requireDelegationState();
    console.log(`委托阶段: ${state.phase}`);
    console.log(`边界确认依据: ${state.boundaryConfirmation}`);
    return;
  }

  if (sub === "discuss") {
    const [rawKind, reference] = rest;
    const kind = requireDesignKind(rawKind);
    if (!reference) throw new Error("用法: ledger delegation discuss solution|code|combined <设计文件>");
    const state = await discussDesign(await requireDelegationState(), kind, reference, PATHS.ledger);
    await saveDelegationState(state, `discuss_${kind} | ${reference}`);
    console.log(`已记录 ${kind} 讨论: ${state.phase}`);
    return;
  }

  if (sub === "confirm") {
    const [rawKind, ...confirmationParts] = rest;
    const kind = requireDesignKind(rawKind);
    const confirmation = confirmationParts.join(" ").trim();
    const state = await confirmDesign(await requireDelegationState(), kind, confirmation, PATHS.ledger);
    await saveDelegationState(state, `confirm_${kind} | ${confirmation}`);
    console.log(`已记录用户确认: ${state.phase}`);
    return;
  }

  if (sub === "permit") {
    const current = await requireDelegationState();
    const regressed = await regressChangedDesign(current, PATHS.ledger);
    if (regressed) {
      await saveDelegationState(regressed, `design_changed | ${current.phase} -> ${regressed.phase}`);
      throw new Error(`设计内容已变化，旧确认失效；当前状态 ${regressed.phase}`);
    }
    const state = await permitImplementation(current, PATHS.ledger);
    await saveDelegationState(state, "implementation_permitted | 完整确认链有效");
    console.log("已取得实现许可: implementation_permitted");
    return;
  }

  throw new Error("未知 delegation 命令。可用: enable | discuss | confirm | permit | status");
}

export async function ledgerStepDone(args: string[]): Promise<void> {
  const [bid, stepId] = args;
  if (!bid || !stepId) throw new Error("用法: ledger step done <Bid> <步骤id>");
  await ensureWorkspace();
  const { step, text } = await requireStep(bid, stepId);
  if (step.state === "done") throw new Error(`步骤 ${stepId} 已标记完成`);
  if (step.state === "suspended") throw new Error(`步骤 ${stepId} 处于挂起状态，请先 resume`);
  await writeText(PATHS.benchmarks, updateStepState(text, bid, stepId, "done"));
  await appendHistoryEvent(historyFile(bid), "step_done", stepId, "-");
  await appendAudit("step", bid, `${stepId} 完成`);
  console.log(`步骤完成: ${stepId}`);
  await showNextStep(bid);
}

export async function ledgerStepSuspend(args: string[]): Promise<void> {
  const [bid, stepId, ...rest] = args;
  if (!bid || !stepId || rest.length === 0) {
    throw new Error("用法: ledger step suspend <Bid> <步骤id> <原因> [--resume-when <条件>]");
  }
  const resumeIndex = rest.indexOf("--resume-when");
  const reasonParts = resumeIndex >= 0 ? rest.slice(0, resumeIndex) : rest;
  const resumeWhen = resumeIndex >= 0 ? rest.slice(resumeIndex + 1).join(" ").trim() : "";
  const reason = reasonParts.join(" ").trim();
  if (!reason) throw new Error("挂起原因不能为空");
  if (resumeIndex >= 0 && !resumeWhen) throw new Error("--resume-when 后必须提供恢复条件");

  const { step, text } = await requireStep(bid, stepId);
  if (step.state !== "pending") throw new Error(`步骤 ${stepId} 当前状态为 ${step.state}，不能挂起`);
  await writeText(PATHS.benchmarks, updateStepState(text, bid, stepId, "suspended"));
  const content = resumeWhen ? `${stepId}；恢复条件：${resumeWhen}` : stepId;
  await appendHistoryEvent(historyFile(bid), "step_suspended", content, reason);
  await appendAudit("step_suspend", bid, `${stepId} | ${reason}${resumeWhen ? ` | 恢复条件: ${resumeWhen}` : ""}`);
  await refreshCurrentProjection();
  console.log(`步骤已挂起: ${stepId}`);
}

export async function ledgerStepResume(args: string[]): Promise<void> {
  const [bid, stepId, ...noteParts] = args;
  if (!bid || !stepId) throw new Error("用法: ledger step resume <Bid> <步骤id> [说明]");
  const { step, text } = await requireStep(bid, stepId);
  if (step.state !== "suspended") throw new Error(`步骤 ${stepId} 当前状态为 ${step.state}，不能恢复`);
  const note = noteParts.join(" ").trim() || "恢复条件已满足";
  await writeText(PATHS.benchmarks, updateStepState(text, bid, stepId, "pending"));
  await appendHistoryEvent(historyFile(bid), "step_resumed", stepId, note);
  await appendAudit("step_resume", bid, `${stepId} | ${note}`);
  await refreshCurrentProjection();
  console.log(`步骤已恢复: ${stepId}`);
}

export async function ledgerNext(args: string[]): Promise<void> {
  const [bid] = args;
  await ensureWorkspace();
  const benches = await readBenches();
  let bench: Bench | undefined;
  if (bid) {
    bench = findBench(benches, bid);
    if (!bench) throw new Error(`找不到 benchmark: ${bid}`);
  } else {
    bench =
      benches.find((b) => b.status === "in_progress") ??
      benches.find((b) => b.status === "pending") ??
      benches[0];
    if (!bench) throw new Error("暂无 benchmark");
  }
  await showNextStep(bench.id);
}

export async function ledgerShow(): Promise<void> {
  if (!(await exists(PATHS.current))) {
    throw new Error("工作区未初始化，请先执行 ledger init");
  }
  process.stdout.write(await readText(PATHS.current));
}

export async function ledgerList(): Promise<void> {
  const machine = await readBenchmarkStates();
  if (machine.length > 0) {
    const works = await readWorkItemStates();
    for (const item of machine) {
      const linked = works.filter((work) => work.benchmarks.includes(item.id));
      console.log(`${item.id}\t${item.title}\t${item.phase}${item.hold ? "/blocked" : ""}\twork=${linked.filter((work) => work.phase === "done").length}/${linked.length}\tverification=${item.verificationStatus ?? "none"}`);
    }
    return;
  }
  const benches = await readBenches();
  if (benches.length === 0) {
    console.log("暂无 benchmark。");
    return;
  }
  console.log("ID\t标题\t状态\t验收\t步骤");
  for (const b of benches) {
    const acceptanceDone = b.acceptanceItems.filter((item) => item.done).length;
    const stepsDone = b.steps.filter((step) => step.state === "done").length;
    console.log(
      `${b.id}\t${b.title}\t${b.status}\t${acceptanceDone}/${b.acceptanceItems.length}\t${stepsDone}/${b.steps.length}`,
    );
  }
}

export async function ledgerSetCurrent(args: string[]): Promise<void> {
  if ((await readBenchmarkStates()).length > 0) {
    throw new Error("current.md 是 v8 只读投影；请使用 ledger project 或 Benchmark/Work Item 状态机命令");
  }
  const [bid, ...stepParts] = args;
  if (!bid) throw new Error("用法: ledger current <Bid> <下一步小步骤>");
  const benches = await readBenches();
  const bench = findBench(benches, bid);
  const stepText = stepParts.join(" ") || "（待讨论）";
  const stepMatch = stepText.match(/^(\S+-S\d+)\s*(.*)$/i);
  const existing = await readCurrentCheckpoint();
  existing.benchmarkId = bench?.id ?? bid;
  existing.benchmarkTitle = bench?.title;
  existing.stepId = stepMatch?.[1];
  existing.stepDescription = stepMatch?.[2]?.trim();
  existing.next = stepText;
  existing.loadRefs = setBenchmarkReference(existing.loadRefs, bid);
  const suspended = await collectSuspendedSummaries(benches);
  existing.suspended = suspended;
  existing.suspendedTotal = suspended.length;
  await writeText(PATHS.current, renderCurrent(existing));
  console.log(`任务入口已更新: ${bench ? `${bench.id} ${bench.title}` : bid} -> ${stepText}`);
}

export async function ledgerEvent(args: string[]): Promise<void> {
  const [bid, type, ...rest] = args;
  if (!bid || !type || rest.length === 0) {
    throw new Error("用法: ledger event <Bid> <类型> <内容> [--reason <原因>]");
  }
  await ensureWorkspace();
  const reasonIndex = rest.indexOf("--reason");
  const content = (reasonIndex >= 0 ? rest.slice(0, reasonIndex) : rest).join(" ").trim();
  const reason = reasonIndex >= 0 ? rest.slice(reasonIndex + 1).join(" ").trim() : "-";
  if (!content) throw new Error("事件内容不能为空");
  if (reasonIndex >= 0 && !reason) throw new Error("--reason 后必须提供原因");
  await appendHistoryEvent(historyFile(bid), type, content, reason || "-");
  await appendAudit("event", bid, `${type} | ${content} | ${reason || "-"}`);
  console.log(`事件已记录到 history/${bid}.md`);
}

export async function ledgerTransition(_args: string[]): Promise<void> {
  throw new Error("ledger transition 已在 v8 废弃；请使用 ledger benchmark 或 ledger work 状态机命令");
}

export async function ledgerProject(): Promise<void> {
  await projectWorkflow();
  console.log("状态投影已刷新");
}

export async function ledgerRepair(): Promise<void> {
  await rebuildStateFromEvents();
  await projectWorkflow();
  console.log("已从 Machine Event 重建状态和投影");
}

export async function ledgerAccept(args: string[]): Promise<void> {
  const [bid] = args;
  if (!bid) throw new Error("用法: ledger accept <Bid> [备注]");
  try {
    await import("../core/projections.ts").then((mod) => mod.readBenchmarkState(bid));
    const overrideIndex = args.indexOf("--override");
    if (overrideIndex >= 0) {
      const reason = args.slice(overrideIndex + 1).join(" ").trim();
      if (!reason) throw new Error("--override 必须提供用户接受风险的原因");
      return await import("./benchmark.ts").then((mod) => mod.ledgerBenchmark(["accept-risk", bid, reason]));
    }
    return await import("./benchmark.ts").then((mod) => mod.ledgerBenchmark(["accept", bid]));
  } catch (error) {
    if (!(error instanceof Error) || !/未注册/.test(error.message)) throw error;
  }
  const benches = await readBenches();
  const bench = findBench(benches, bid);
  if (!bench) throw new Error(`找不到 benchmark: ${bid}`);
  const overrideIndex = args.indexOf("--override");
  const overrideReason = overrideIndex >= 0 ? args.slice(overrideIndex + 1).join(" ").trim() : "";
  if (overrideIndex >= 0 && !overrideReason) throw new Error("--override 必须提供用户接受风险的原因");

  if (overrideIndex < 0) {
    const unfinished = bench.steps.filter((step) => step.state !== "done");
    if (unfinished.length > 0) throw new Error(`${bid} 仍有 ${unfinished.length} 个未完成或挂起步骤`);
    const record = await readVerificationRecord(bid);
    if (!record) throw new Error(`${bid} 缺少验证证据；如用户明确接受风险，可使用 --override <原因>`);
    await evaluateVerification(record, bench);
    await writeVerificationRecord(record);
    if (record.status !== "valid") {
      throw new Error(`${bid} 验证状态为 ${record.status}；如用户明确接受风险，可使用 --override <原因>`);
    }
    const text = await readText(PATHS.benchmarks);
    await writeText(PATHS.benchmarks, markAcceptanceItemsDone(text, bid, bench.acceptanceItems.map((item) => item.id)));
    await appendAudit("accept", bid, "验证证据有效");
    await appendHistoryEvent(historyFile(bid), "accepted", "验证证据有效", "-");
  } else {
    await appendAudit("accept_override", bid, overrideReason);
    await appendHistoryEvent(historyFile(bid), "accept_override", "用户接受缺失验证或已知风险", overrideReason);
  }
  if (bench.status !== "done") {
    await updateBenchStatus(bid, "done");
    console.log(`Bid ${bid} 状态已更新为 done。`);
  }
  console.log(`验收已记录: ${bid}${overrideReason ? ` - override: ${overrideReason}` : ""}`);
}

export async function ledgerStatus(): Promise<void> {
  await ensureWorkspace();
  const machine = await readBenchmarkStates();
  const benches = machine.length > 0 ? [] : await readBenches();
  let reminders = 0;

  console.log("== 台账状态 ==");
  console.log(`当前任务: ${readActiveTaskId()}`);
  const completedIds = machine.length > 0
    ? machine.filter((b) => b.phase === "accepted" || b.phase === "accepted_with_risk").map((b) => b.id)
    : benches.filter((b) => b.status === "done").map((b) => b.id);
  for (const id of completedIds) {
    const snap = join(PATHS.snapshots, `${id}-snapshot.json`);
    if (!(await exists(snap))) {
      console.log(`提醒: ${id} 已验收但未编译（缺少 ${id}-snapshot.json），请执行 ledger compile ${id}`);
      reminders++;
    }
  }
  const total = machine.length || benches.length;
  if (total === 0) {
    console.log("暂无 benchmark。");
  } else {
    console.log(`共 ${total} 个 benchmark，其中 accepted ${completedIds.length} 个。`);
  }

  const contextRefs = await plannedContextReferences();
  let estimatedTokens = 0;
  for (const ref of contextRefs) {
    try {
      estimatedTokens += (await loadReference(ref)).estimatedTokens;
    } catch {
      // 缺失引用由 ledger context 显示详情，不阻断 status。
    }
  }
  console.log(`当前装配计划: ${contextRefs.length} 个引用，约 ${estimatedTokens} tokens（估算）`);
  if (estimatedTokens >= 15000) {
    console.log("提醒: 上下文估算已达到 15k 参考警戒值；不会阻止继续加载。");
    reminders++;
  }

  const learningCount = await countLearnings();
  console.log(`learnings.md: ${learningCount} 条学习记录（警戒 10）`);
  if (learningCount >= 10) {
    console.log("提醒: 学习记录已达 10 条警戒线，建议蒸馏（heuristics distill）。");
    reminders++;
  }

  const activeId = readActiveTaskId();
  const otherIds = listTaskIds().filter((id) => id !== activeId);
  let otherReminders = 0;
  for (const id of otherIds) {
    otherReminders += await countTaskLedgerReminders(taskLedgerDir(id));
  }
  if (otherReminders > 0) {
    console.log(`其他任务共 ${otherReminders} 条提醒。`);
  }

  if (reminders === 0 && otherReminders === 0) {
    console.log("状态正常，无待办提醒。");
  } else {
    console.log(`当前任务 ${reminders} 条提醒，其他任务 ${otherReminders} 条提醒。`);
  }
}

export async function ledgerContext(): Promise<void> {
  await ensureWorkspace();
  const refs = await plannedContextReferences();
  const loaded = [];
  console.log(`== 上下文装配预览 ==\n当前任务: ${readActiveTaskId()}`);
  for (const ref of refs) {
    try {
      loaded.push(await loadReference(ref));
    } catch (error) {
      console.log(`  ! ${ref}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const totalCharacters = loaded.reduce((sum, item) => sum + item.characters, 0);
  const totalTokens = loaded.reduce((sum, item) => sum + item.estimatedTokens, 0);
  for (const item of [...loaded].sort((a, b) => b.estimatedTokens - a.estimatedTokens)) {
    console.log(`  ${item.reference}: ${item.characters} 字符，约 ${item.estimatedTokens} tokens`);
  }
  console.log(`合计: ${loaded.length} 个引用，${totalCharacters} 字符，约 ${totalTokens} tokens`);
  if (totalTokens >= 15000) console.log("提醒: 估算已达到 15k 参考警戒值；这不会阻止继续加载。");
}

export async function ledgerLoad(args: string[]): Promise<void> {
  await ensureWorkspace();
  const refs = [...new Set(args.length > 0 ? args : await plannedContextReferences())];
  const loaded = [];
  for (const ref of refs) loaded.push(await loadReference(ref));
  const characters = loaded.reduce((sum, item) => sum + item.characters, 0);
  const estimatedTokens = loaded.reduce((sum, item) => sum + item.estimatedTokens, 0);
  for (const item of loaded) {
    console.log(`\n===== ${item.reference} =====\n${item.content.trimEnd()}`);
  }
  console.log(`\n已加载 ${loaded.length} 个引用，${characters} 字符，估算 ${estimatedTokens} tokens`);
  const names = loaded.map((item) => `${item.reference}(${item.characters}/${item.estimatedTokens})`);
  const row = `| ${today()} | ${readActiveTaskId()} | ${loaded.length} | ${characters} | ${estimatedTokens} | ${names.join(", ")} |\n`;
  await appendText(PATHS.loads, row);
}

export async function ledgerLoads(): Promise<void> {
  if (!(await exists(PATHS.loads))) {
    throw new Error("loads.md 不存在，请先执行 ledger init");
  }
  process.stdout.write(await readText(PATHS.loads));
}

export async function ledgerCompile(args: string[]): Promise<void> {
  const [bid] = args;
  if (!bid) throw new Error("用法: ledger compile <Bid>");
  await ensureWorkspace();

  let accepted = false;
  try {
    const state = await import("../core/projections.ts").then((mod) => mod.readBenchmarkState(bid));
    accepted = state.phase === "accepted" || state.phase === "accepted_with_risk";
    if (!accepted) throw new Error(`${bid} 尚未验收（当前状态 ${state.phase}），不应编译。`);
  } catch (error) {
    if (error instanceof Error && !/未注册/.test(error.message)) throw error;
    const benches = await readBenches();
    const bench = findBench(benches, bid);
    if (!bench) throw new Error(`找不到 benchmark: ${bid}`);
    if (bench.status !== "done") throw new Error(`${bid} 尚未完成（当前状态 ${bench.status}），不应编译。`);
  }

  const draftPath = join(PATHS.snapshots, `${bid}-draft.json`);
  if (!(await exists(draftPath))) {
    throw new Error(`缺少快照草稿: ${draftPath}\n请先由 LLM 写入语义结论，再执行本命令。`);
  }
  const draft = await readJson(draftPath);
  const errors = validateSnapshotDraft(draft, bid);
  if (errors.length > 0) {
    throw new Error(`快照草稿校验失败:\n- ${errors.join("\n- ")}`);
  }

  const historyFile = join(PATHS.history, `${bid}.md`);
  let archiveRelative: string | null = null;
  let archivePath: string | null = null;
  if (await exists(historyFile)) {
    const version = await nextArchiveVersion(bid);
    archiveRelative = `history/archive/${bid}-v${String(version).padStart(3, "0")}.md`;
    archivePath = join(PATHS.ledger, ...archiveRelative.split("/"));
    await moveFile(historyFile, archivePath);
  }

  const finalSnapshot = {
    ...(draft as Record<string, unknown>),
    compiledAt: today(),
    sourceEvents: { historyFile: `history/${bid}.md`, archive: archiveRelative },
  };
  const snapshotPath = join(PATHS.snapshots, `${bid}-snapshot.json`);
  try {
    await writeTextAtomic(snapshotPath, JSON.stringify(finalSnapshot, null, 2) + "\n");
  } catch (error) {
    if (archivePath) await moveFile(archivePath, historyFile);
    throw error;
  }

  if (archivePath) console.log(`历史事件已归档: ${archivePath}`);
  await appendAudit("compile", bid, `快照生成: snapshots/${bid}-snapshot.json | archive: ${archiveRelative ?? "无"}`);
  console.log(`编译完成: ${bid} -> snapshots/${bid}-snapshot.json`);
  console.log("后续加载该 benchmark 时，只读快照 + 快照之后的新事件。");
}

async function showNextStep(bid: string): Promise<void> {
  const text = await readText(PATHS.benchmarks);
  const benches = parseBenchmarks(text);
  const bench = findBench(benches, bid);
  if (!bench) throw new Error(`找不到 benchmark: ${bid}`);
  const next = findRunnableStep(bench);
  if (next) {
    const current = await readCurrentCheckpoint();
    current.benchmarkId = bench.id;
    current.benchmarkTitle = bench.title;
    current.stepId = next.id;
    current.stepDescription = next.description;
    current.next = `${next.id} ${next.description}`;
    current.loadRefs = setBenchmarkReference(current.loadRefs, bid);
    const suspended = await collectSuspendedSummaries(benches);
    current.suspended = suspended;
    current.suspendedTotal = suspended.length;
    await writeText(PATHS.current, renderCurrent(current));
    console.log(`下一步: ${next.id} ${next.description}`);
    return;
  }
  const pendingAcceptance = bench.acceptanceItems.filter((item) => !item.done).length;
  if (pendingAcceptance > 0) {
    console.log(`没有可执行步骤，但验收标准还有 ${pendingAcceptance} 项未完成。`);
  } else {
    console.log(`本 benchmark 已全部完成，请执行全量测试（test run）并验收（ledger accept ${bid}）。`);
  }
}

async function writeLedgerTemplates(ledgerDir: string): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  for (const [rel, content] of workspaceFiles) {
    if (!rel.startsWith("ledger/")) continue;
    const target = join(ledgerDir, rel.slice("ledger/".length));
    if (await exists(target)) {
      skipped++;
      continue;
    }
    await writeText(target, content);
    created++;
  }
  return { created, skipped };
}

function sanitizeTaskName(name: string): string {
  const s = name
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || "默认";
}

function taskNumber(id: string): number | null {
  const m = id.match(/^T(\d+)-/);
  return m ? Number(m[1]) : null;
}

async function countTaskLedgerReminders(ledgerDir: string): Promise<number> {
  let n = 0;
  const benchesFile = join(ledgerDir, "benchmarks.md");
  if (await exists(benchesFile)) {
    const benches = parseBenchmarks(await readText(benchesFile));
    for (const b of benches) {
      if (b.status === "done") {
        const snap = join(ledgerDir, "snapshots", `${b.id}-snapshot.json`);
        if (!(await exists(snap))) n++;
      }
    }
  }
  return n;
}

async function requireDelegationState(): Promise<DelegationState> {
  const state = await readDelegationState(PATHS.delegationState);
  if (!state) throw new Error("当前任务未启用委托状态机");
  return state;
}

function requireDesignKind(value: string | undefined): DesignKind {
  if (value === "solution" || value === "code" || value === "combined") return value;
  throw new Error("设计类型必须是 solution、code 或 combined");
}

async function saveDelegationState(state: DelegationState, audit: string): Promise<void> {
  await writeDelegationState(PATHS.delegationState, state);
  const current = await readCurrentCheckpoint();
  current.stage = delegationStageLabel(state.phase);
  current.next = delegationNextStep(state.phase);
  await writeText(PATHS.current, renderCurrent(current));
  await appendAudit("delegation", "phase", audit);
}

function delegationStageLabel(phase: DelegationState["phase"]): string {
  if (phase === "implementation_permitted") return "允许实现";
  if (phase.endsWith("_confirmed")) return "等待下一阶段讨论";
  return "等待用户明确确认";
}

function delegationNextStep(phase: DelegationState["phase"]): string {
  const next: Record<DelegationState["phase"], string> = {
    boundary_confirmed: "展示方案设计并记录讨论。",
    solution_discussed: "等待用户明确确认方案设计。",
    solution_confirmed: "展示代码设计并记录讨论。",
    code_design_discussed: "等待用户明确确认代码设计。",
    code_design_confirmed: "检查完整确认链并取得实现许可。",
    combined_design_discussed: "等待用户明确确认合并设计。",
    combined_design_confirmed: "检查合并设计确认并取得实现许可。",
    implementation_permitted: "开始实现与验证。",
  };
  return next[phase];
}

async function readBenches(): Promise<Bench[]> {
  if (!(await exists(PATHS.benchmarks))) {
    throw new Error("工作区未初始化，请先执行 ledger init");
  }
  return parseBenchmarks(await readText(PATHS.benchmarks));
}

async function ensureWorkspace(): Promise<void> {
  if (!(await exists(PATHS.ledger))) {
    throw new Error("工作区未初始化，请先执行 ledger init");
  }
}

async function appendAudit(type: string, object: string, note: string): Promise<void> {
  const row = `| ${today()} | ${type} | ${object} | ${note} |\n`;
  await appendText(PATHS.audit, row);
}

async function updateBenchStatus(bid: string, status: BenchmarkStatus): Promise<void> {
  const text = await readText(PATHS.benchmarks);
  await writeText(PATHS.benchmarks, updateBenchmarkStatusText(text, bid, status));
}

async function requireStep(bid: string, stepId: string): Promise<{ bench: Bench; step: Bench["steps"][number]; text: string }> {
  await ensureWorkspace();
  const text = await readText(PATHS.benchmarks);
  const bench = findBench(parseBenchmarks(text), bid);
  if (!bench) throw new Error(`找不到 benchmark: ${bid}`);
  const step = findStep(bench, stepId);
  if (!step) throw new Error(`找不到步骤: ${bid} / ${stepId}`);
  return { bench, step, text };
}

function historyFile(bid: string): string {
  return join(PATHS.history, `${bid}.md`);
}

async function readCurrentCheckpoint() {
  if (await exists(PATHS.current)) return parseCurrent(await readText(PATHS.current));
  return { stage: "待恢复", next: "（待讨论）", loadRefs: [], suspended: [], suspendedTotal: 0 };
}

async function refreshCurrentProjection(): Promise<void> {
  const current = await readCurrentCheckpoint();
  const suspended = await collectSuspendedSummaries(await readBenches());
  current.suspended = suspended;
  current.suspendedTotal = suspended.length;
  await writeText(PATHS.current, renderCurrent(current));
}

async function collectSuspendedSummaries(benches: Bench[]): Promise<SuspendedSummary[]> {
  const summaries: SuspendedSummary[] = [];
  for (const bench of benches) {
    const suspendedSteps = bench.steps.filter((step) => step.state === "suspended");
    if (suspendedSteps.length === 0) continue;
    const events = await readHistoryEvents(historyFile(bench.id));
    for (const step of suspendedSteps) {
      const event = [...events].reverse().find((item) => item.type === "step_suspended" && item.content.startsWith(step.id));
      const resumeWhen = event?.content.match(/恢复条件：(.+)$/)?.[1];
      summaries.push({
        benchmarkId: bench.id,
        stepId: step.id,
        reason: event?.reason && event.reason !== "-" ? event.reason : "已挂起",
        resumeWhen,
      });
    }
  }
  return summaries;
}

function setBenchmarkReference(current: string[], bid: string): string[] {
  const preserved = current.filter((ref) => !/^ledger\/benchmarks\.md#B\S+$/i.test(ref));
  return [...new Set([...preserved, `ledger/benchmarks.md#${bid}`])];
}

async function nextArchiveVersion(bid: string): Promise<number> {
  const archiveDir = join(PATHS.history, "archive");
  let entries: string[] = [];
  try {
    entries = await readdir(archiveDir);
  } catch {
    return 1;
  }
  const pattern = new RegExp(`^${bid}-v(\\d+)\\.md$`, "i");
  const versions = entries.map((name) => Number(name.match(pattern)?.[1] ?? 0));
  return Math.max(0, ...versions) + 1;
}

async function plannedContextReferences(): Promise<string[]> {
  const current = await readCurrentCheckpoint();
  const refs = [
    "ledger/current.md",
    "ledger/authority.md",
    "knowledge/index.md",
    "discussion/operation-log.md",
    ...current.loadRefs,
  ];
  const discussion = await readDiscussionState(PATHS.discussionState);
  if (discussion) refs.push(...discussionReferences(discussion));
  return [...new Set(refs)];
}

async function countLines(p: string): Promise<number> {
  if (!(await exists(p))) return 0;
  const text = await readText(p);
  return text.split(/\r?\n/).length;
}

async function countLearnings(): Promise<number> {
  if (!(await exists(PATHS.learnings))) return 0;
  const text = await readText(PATHS.learnings);
  return text.split(/\r?\n/).filter((l) => /^-\s+\S/.test(l.trim())).length;
}
