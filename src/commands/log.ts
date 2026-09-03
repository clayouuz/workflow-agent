import { relative } from "node:path";
import { appendOperation, tailOperations, type OperationRecord } from "../core/operation-log.ts";
import { WORKSPACE } from "../core/workspace.ts";

export async function logAppend(args: string[]): Promise<void> {
  const [summary, ...options] = args;
  if (!summary || summary.startsWith("--")) {
    throw new Error("用法: log append <摘要> [--type <类型>] [--subject <对象>] [--reason <原因>] [--artifact <路径>]...");
  }
  const parsed = parseOptions(options, new Set(["actor", "type", "subject", "reason", "artifact"]), new Set(["artifact"]));
  const result = await appendOperation({
    summary,
    actor: parsed.single.actor as "user" | "ai" | undefined,
    type: parsed.single.type,
    subject: parsed.single.subject,
    reason: parsed.single.reason,
    artifacts: parsed.repeated.artifact ?? [],
  });
  console.log(`已追加 Operation Log: ${relative(WORKSPACE, result.path).replaceAll("\\", "/")}`);
}

export async function logTail(args: string[]): Promise<void> {
  let limit = 20;
  let optionArgs = args;
  if (args[0] && !args[0].startsWith("--")) {
    limit = Number(args[0]);
    optionArgs = args.slice(1);
  }
  const parsed = parseOptions(optionArgs, new Set(["actor", "type", "subject"]), new Set());
  const records = await tailOperations({ limit, actor: parsed.single.actor as "user" | "ai" | undefined, type: parsed.single.type, subject: parsed.single.subject });
  for (const record of records) console.log(formatOperation(record));
}

function formatOperation(record: OperationRecord): string {
  const subject = record.subject ? ` [${record.subject}]` : "";
  const reason = record.reason ? ` | ${record.reason}` : "";
  const artifacts = record.artifacts.length > 0 ? ` | artifacts: ${record.artifacts.join(", ")}` : "";
  return `${record.timestamp} [${record.actor}/${record.type}]${subject} ${record.summary}${reason}${artifacts}`;
}

function parseOptions(
  args: string[],
  allowed: Set<string>,
  repeatable: Set<string>,
): { single: Record<string, string>; repeated: Record<string, string[]> } {
  const single: Record<string, string> = {};
  const repeated: Record<string, string[]> = {};
  for (let index = 0; index < args.length; index += 2) {
    const raw = args[index];
    const value = args[index + 1];
    if (!raw?.startsWith("--")) throw new Error(`无法识别的参数: ${raw ?? "(空)"}`);
    const name = raw.slice(2);
    if (!allowed.has(name)) throw new Error(`未知选项: --${name}`);
    if (!value || value.startsWith("--")) throw new Error(`--${name} 后必须提供值`);
    if (repeatable.has(name)) {
      (repeated[name] ??= []).push(value);
    } else {
      if (single[name] !== undefined) throw new Error(`选项重复: --${name}`);
      single[name] = value;
    }
  }
  return { single, repeated };
}
