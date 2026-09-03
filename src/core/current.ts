export interface SuspendedSummary {
  benchmarkId: string;
  stepId: string;
  reason: string;
  resumeWhen?: string;
}

export interface CurrentCheckpoint {
  stage: string;
  benchmarkId?: string;
  benchmarkTitle?: string;
  stepId?: string;
  stepDescription?: string;
  next: string;
  loadRefs: string[];
  suspended: SuspendedSummary[];
  suspendedTotal: number;
}

export function parseCurrent(text: string): CurrentCheckpoint {
  const stage = sectionBody(text, "当前阶段") || "待恢复";
  const work = sectionBody(text, "当前工作") || sectionBody(text, "当前大 benchmark");
  const next = sectionBody(text, "下一步") || sectionBody(text, "下一步小步骤") || "（待讨论）";
  const workMatch = work.match(/^(\S+)(?:\s+([^/\n]+?))?(?:\s*\/\s*(\S+)(?:\s+(.+))?)?$/);
  return {
    stage,
    benchmarkId: workMatch?.[1]?.startsWith("B") ? workMatch[1] : undefined,
    benchmarkTitle: workMatch?.[2]?.trim(),
    stepId: workMatch?.[3],
    stepDescription: workMatch?.[4]?.trim(),
    next,
    loadRefs: sectionList(text, "继续工作时加载"),
    suspended: [],
    suspendedTotal: 0,
  };
}

export function renderCurrent(checkpoint: CurrentCheckpoint): string {
  const work = checkpoint.benchmarkId
    ? `${checkpoint.benchmarkId}${checkpoint.benchmarkTitle ? ` ${checkpoint.benchmarkTitle}` : ""}${checkpoint.stepId ? ` / ${checkpoint.stepId}${checkpoint.stepDescription ? ` ${checkpoint.stepDescription}` : ""}` : ""}`
    : "（待讨论）";
  const refs = checkpoint.loadRefs.length > 0 ? checkpoint.loadRefs.map((ref) => `- ${ref}`).join("\n") : "（无）";
  const visibleSuspended = checkpoint.suspended.slice(0, 3);
  let suspended = visibleSuspended.length > 0
    ? visibleSuspended.map((item) => {
      const resume = item.resumeWhen ? `；恢复条件：${item.resumeWhen}` : "";
      return `- ${item.benchmarkId}/${item.stepId} ${item.reason}${resume}`;
    }).join("\n")
    : "（无）";
  if (checkpoint.suspendedTotal > visibleSuspended.length) {
    suspended += `\n- 另有 ${checkpoint.suspendedTotal - visibleSuspended.length} 项，详见 benchmarks.md`;
  }

  // current.md 是可重建的会话入口；权威状态仍在 benchmarks.md 与 history/ 中。
  return `# 任务入口

## 当前阶段
${checkpoint.stage}

## 当前工作
${work}

## 下一步
${checkpoint.next}

## 继续工作时加载
${refs}

## 挂起提醒
${suspended}
`;
}

function sectionBody(text: string, title: string): string {
  return sectionLines(text, title).filter((line) => !line.trim().startsWith("- ")).join(" ").trim();
}

function sectionList(text: string, title: string): string[] {
  return sectionLines(text, title).map((line) => line.trim().replace(/^[-*]\s+/, "")).filter((line) => line && line !== "（无）");
}

function sectionLines(text: string, title: string): string[] {
  const lines = text.split(/\r?\n/);
  const output: string[] = [];
  let collecting = false;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      if (collecting) break;
      collecting = heading[1] === title;
      continue;
    }
    if (collecting && line.trim()) output.push(line.trim());
  }
  return output;
}
