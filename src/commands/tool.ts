import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { exists, readText, writeText, ensureDir, today } from "../core/fs.ts";
import { PATHS } from "../core/workspace.ts";

export async function toolList(): Promise<void> {
  if (!(await exists(PATHS.toolRegistry))) {
    throw new Error("工具注册表不存在，请先执行 ledger init");
  }
  process.stdout.write(await readText(PATHS.toolRegistry));
}

export async function toolPropose(args: string[]): Promise<void> {
  const [name, ...descParts] = args;
  if (!name) throw new Error("用法: tool propose <工具名> <场景与建议>");
  const desc = descParts.join(" ") || "（待补充）";
  await ensureDir(PATHS.toolProposals);
  const file = join(PATHS.toolProposals, `${safeFileName(name)}.md`);
  const content = `# 新工具提议: ${name}

## 场景
${desc}

## 能力边界
（待讨论填写：能做 / 不能做）

## 确定性程度
（待讨论填写：输入输出是否完全确定）

## 决策
（用户确认后，或拒绝并说明理由）
`;
  await writeText(file, content);
  console.log(`已生成新工具提议: ${file}`);
}

export async function toolRequest(args: string[]): Promise<void> {
  const [toolName, ...descParts] = args;
  if (!toolName) throw new Error("用法: tool request <已有工具名> <扩展需求>");
  const desc = descParts.join(" ") || "（待补充）";
  await ensureDir(PATHS.toolRequests);
  const safeName = safeFileName(toolName);
  const version = await nextRequestVersion(safeName);
  const file = join(PATHS.toolRequests, `${safeName}-v${String(version).padStart(3, "0")}.md`);
  const content = `# 工具扩展申请: ${toolName}

## 日期
${today()}

## 扩展需求
${desc}

## 现状
（该工具当前能力边界见 tools/ 下对应能力卡片）

## 决策
（用户确认后，更新能力卡片并实现）
`;
  await writeText(file, content);
  console.log(`已生成扩展申请: ${file}`);
}

async function nextRequestVersion(toolName: string): Promise<number> {
  let names: string[] = [];
  try {
    names = await readdir(PATHS.toolRequests);
  } catch {
    return 1;
  }
  const pattern = new RegExp(`^${escapeRegExp(toolName)}-v(\\d+)\\.md$`, "i");
  const versions = names.map((name) => Number(name.match(pattern)?.[1] ?? 0));
  return Math.max(0, ...versions) + 1;
}

function safeFileName(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!safe) throw new Error("工具名不能只包含路径或文件名非法字符");
  return safe;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
