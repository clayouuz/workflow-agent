export interface SnapshotSuperseded {
  old: string;
  replacedBy: string;
}

export interface SnapshotDraft {
  benchmarkId: string;
  stillBinding: string[];
  superseded: SnapshotSuperseded[];
  contextualArchived: number;
}

export interface SnapshotFile extends SnapshotDraft {
  compiledAt: string;
  sourceEvents: {
    historyFile: string;
    archive: string | null;
  };
}

export function validateSnapshotDraft(data: unknown, expectedBid: string): string[] {
  const errors: string[] = [];
  if (typeof data !== "object" || data === null) return ["快照草稿必须是 JSON 对象"];
  const snapshot = data as Record<string, unknown>;
  if (snapshot.benchmarkId !== expectedBid) errors.push(`benchmarkId 应为 "${expectedBid}"`);
  if (!Array.isArray(snapshot.stillBinding) || !snapshot.stillBinding.every((item) => typeof item === "string")) {
    errors.push("stillBinding 必须是字符串数组");
  }
  if (!Array.isArray(snapshot.superseded)) {
    errors.push("superseded 必须是数组");
  } else {
    for (const item of snapshot.superseded) {
      if (typeof item !== "object" || item === null) {
        errors.push("superseded 每项必须是对象");
        continue;
      }
      const pair = item as Record<string, unknown>;
      if (typeof pair.old !== "string" || typeof pair.replacedBy !== "string") {
        errors.push("superseded 每项必须含 old 和 replacedBy 字符串");
      }
    }
  }
  if (typeof snapshot.contextualArchived !== "number") errors.push("contextualArchived 必须是数字");
  return errors;
}

