import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { exists, readText, writeText, appendText, moveFile, today } from "../core/fs.ts";
import { PATHS } from "../core/workspace.ts";
import { learningsHeader } from "../core/templates.ts";

export async function heuristicsShow(): Promise<void> {
  if (!(await exists(PATHS.strategy))) {
    throw new Error("策略文件不存在，请先执行 ledger init");
  }
  process.stdout.write(await readText(PATHS.strategy));
}

export async function heuristicsLearn(args: string[]): Promise<void> {
  const text = args.join(" ");
  if (!text.trim()) throw new Error("用法: heuristics learn <学习记录内容>");
  const line = `- ${today()}: 用户要求启发而模型未主动给出 | ${text}\n`;
  await appendText(PATHS.learnings, line);
  const count = await countLearnings();
  console.log(`已追加学习记录（当前 ${count} 条）。`);
  if (count >= 10) console.log("提醒: 学习记录已达 10 条警戒线，建议蒸馏。");
}

export async function heuristicsCheck(): Promise<void> {
  const lines = await countLines(PATHS.strategy);
  const learnings = await countLearnings();
  console.log(`strategy.md: ${lines} 行`);
  console.log(`learnings.md: ${learnings} 条（警戒 10）`);
  if (learnings >= 10) console.log("提醒: 学习记录已达 10 条警戒线，建议蒸馏。");
}

export async function heuristicsDistill(): Promise<void> {
  if (!(await exists(PATHS.strategy))) {
    throw new Error("策略文件不存在，请先执行 ledger init");
  }
  const learningsPath = PATHS.learnings;
  if (await exists(learningsPath)) {
    const content = await readText(learningsPath);
    const hasEntries = content.split(/\r?\n/).some((l) => /^-\s+\S/.test(l.trim()));
    if (hasEntries) {
      const archive = join(PATHS.heuristicsArchive, `learnings-v${String(await nextArchiveVersion()).padStart(3, "0")}.md`);
      await moveFile(learningsPath, archive);
      await writeText(learningsPath, learningsHeader);
      console.log(`学习记录已归档至: ${archive}`);
    }
  }
  console.log("蒸馏完成。学习记录已归档，strategy.md 保留模型确认后的内容。");
}

async function nextArchiveVersion(): Promise<number> {
  let names: string[] = [];
  try {
    names = await readdir(PATHS.heuristicsArchive);
  } catch {
    return 1;
  }
  const versions = names.map((name) => Number(name.match(/^learnings-v(\d+)\.md$/i)?.[1] ?? 0));
  return Math.max(0, ...versions) + 1;
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
