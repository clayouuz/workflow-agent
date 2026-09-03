import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { appendText, exists } from "./fs.ts";
import { PATHS, readActiveTaskId } from "./workspace.ts";

export interface OperationRecord {
  version: 1;
  timestamp: string;
  taskId: string;
  actor: "user" | "ai";
  type: string;
  subject?: string;
  summary: string;
  reason?: string;
  artifacts: string[];
}

export interface AppendOperationInput {
  summary: string;
  actor?: "user" | "ai";
  type?: string;
  subject?: string;
  reason?: string;
  artifacts?: string[];
  now?: Date;
}

export interface TailOperationOptions {
  limit?: number;
  type?: string;
  subject?: string;
  actor?: "user" | "ai";
}

export interface AppendOperationResult {
  path: string;
  record: OperationRecord;
}

export async function appendOperation(input: AppendOperationInput): Promise<AppendOperationResult> {
  await requireActiveTask();
  return appendOperationAt(PATHS.operations, readActiveTaskId(), input);
}

export async function appendOperationAt(
  operationsDir: string,
  taskId: string,
  input: AppendOperationInput,
): Promise<AppendOperationResult> {
  const summary = requiredText(input.summary, "摘要");
  const type = optionalText(input.type, "类型") ?? "note";
  const actor = input.actor ?? "ai";
  if (actor !== "user" && actor !== "ai") throw new Error("actor 必须是 user 或 ai");
  const subject = optionalText(input.subject, "对象");
  const reason = optionalText(input.reason, "原因");
  const artifacts = (input.artifacts ?? []).map((item) => requiredText(item, "Artifact"));
  const timestamp = (input.now ?? new Date()).toISOString();
  const record: OperationRecord = {
    version: 1,
    timestamp,
    taskId: requiredText(taskId, "任务 id"),
    actor,
    type,
    ...(subject ? { subject } : {}),
    summary,
    ...(reason ? { reason } : {}),
    artifacts,
  };
  const path = join(operationsDir, `${timestamp.slice(0, 7)}.ndjson`);

  // Append is intentionally the only write path: recording a checkpoint must
  // not scan history, rebuild projections, or make normal task work wait.
  await appendText(path, `${JSON.stringify(record)}\n`);
  return { path, record };
}

export async function tailOperations(options: TailOperationOptions = {}): Promise<OperationRecord[]> {
  await requireActiveTask();
  return tailOperationsAt(PATHS.operations, options);
}

export async function tailOperationsAt(
  operationsDir: string,
  options: TailOperationOptions = {},
): Promise<OperationRecord[]> {
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("tail 数量必须是 1 到 200 的整数");
  }
  const type = optionalText(options.type, "类型");
  const subject = optionalText(options.subject, "对象");
  const actor = options.actor;
  if (actor !== undefined && actor !== "user" && actor !== "ai") throw new Error("actor 必须是 user 或 ai");
  if (!(await exists(operationsDir))) return [];

  const files = (await readdir(operationsDir))
    .filter((name) => /^\d{4}-\d{2}\.ndjson$/.test(name))
    .sort()
    .reverse();
  const newestFirst: OperationRecord[] = [];

  for (const file of files) {
    const path = join(operationsDir, file);
    const lines = (await readFile(path, "utf8")).split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index--) {
      const line = lines[index].trim();
      if (!line) continue;
      const record = parseRecord(line, file, index + 1);
      if (type && record.type !== type) continue;
      if (subject && record.subject !== subject) continue;
      if (actor && record.actor !== actor) continue;
      newestFirst.push(record);
      if (newestFirst.length >= limit) return newestFirst.reverse();
    }
  }

  return newestFirst.reverse();
}

function parseRecord(line: string, file: string, lineNumber: number): OperationRecord {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    throw new Error(`Operation Log 损坏: ${file}:${lineNumber} 不是合法 NDJSON`);
  }
  if (typeof value !== "object" || value === null) {
    throw new Error(`Operation Log 损坏: ${file}:${lineNumber} 记录不是对象`);
  }
  const record = value as Partial<OperationRecord>;
  if (
    record.version !== 1 ||
    typeof record.timestamp !== "string" ||
    typeof record.taskId !== "string" ||
    typeof record.type !== "string" ||
    typeof record.summary !== "string" ||
    !Array.isArray(record.artifacts) ||
    !record.artifacts.every((item) => typeof item === "string") ||
    (record.subject !== undefined && typeof record.subject !== "string") ||
    (record.reason !== undefined && typeof record.reason !== "string") ||
    (record.actor !== undefined && record.actor !== "user" && record.actor !== "ai")
  ) {
    throw new Error(`Operation Log 损坏: ${file}:${lineNumber} 记录格式无效`);
  }
  return { ...record, actor: record.actor === "user" ? "user" : "ai" } as OperationRecord;
}

async function requireActiveTask(): Promise<void> {
  if (!(await exists(PATHS.ledger))) {
    throw new Error("当前任务不存在或未初始化，请先执行 ledger init 或绑定已有任务");
  }
}

function requiredText(value: string | undefined, label: string): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new Error(`${label}不能为空`);
  return normalized;
}

function optionalText(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredText(value, label);
}
