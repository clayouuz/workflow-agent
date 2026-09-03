import { exists, readText, writeText, appendText, today } from "../core/fs.ts";
import { PATHS, readActiveTaskId } from "../core/workspace.ts";

const SECTIONS = ["路径与资源", "文档入口", "项目约定"];

/**
 * 拒绝式审批：agent 直接写入索引（默认通过），用户不满意时用 knowledge remove 删除。
 */
export async function knowledgeAdd(args: string[]): Promise<void> {
  const [section, ...contentParts] = args;
  if (!section || contentParts.length === 0) {
    throw new Error(`用法: knowledge add <段落> <内容>\n可用段落: ${SECTIONS.join(" | ")}`);
  }
  if (!SECTIONS.includes(section)) {
    throw new Error(`未知段落: ${section}。可用: ${SECTIONS.join(" | ")}`);
  }
  await ensureKnowledge();
  const content = contentParts.join(" ");
  const indexText = await readText(PATHS.knowledgeIndex);
  if (hasDuplicate(indexText, section, content)) {
    console.log(`知识已存在，未重复加入 [${section}] ${content}`);
    return;
  }
  const updated = insertIntoIndex(indexText, section, content);
  await writeText(PATHS.knowledgeIndex, updated);
  await appendKnowledgeAudit("add", section, content);
  console.log(`已加入知识索引 [${section}] ${content}`);
  console.log("如不认可，可执行: knowledge remove " + section + " <关键词>");
}

export async function knowledgeList(): Promise<void> {
  await ensureKnowledge();
  process.stdout.write(await readText(PATHS.knowledgeIndex));
}

export async function knowledgeRemove(args: string[]): Promise<void> {
  const [section, ...keywordParts] = args;
  if (!section || keywordParts.length === 0) {
    throw new Error("用法: knowledge remove <段落> <关键词>");
  }
  await ensureKnowledge();
  const keyword = keywordParts.join(" ");
  const indexText = await readText(PATHS.knowledgeIndex);
  const { text, removed } = removeFromIndex(indexText, section, keyword);
  if (removed === 0) {
    throw new Error(`未在 [${section}] 中找到含 "${keyword}" 的条目`);
  }
  await writeText(PATHS.knowledgeIndex, text);
  await appendKnowledgeAudit("remove", section, keyword);
  console.log(`已移除 ${removed} 条知识。`);
}

function insertIntoIndex(indexText: string, section: string, content: string): string {
  const lines = indexText.split(/\r?\n/);
  const out: string[] = [];
  let inserted = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inserted && line.trim() === `## ${section}`) {
      out.push(line);
      // 跳过紧跟段落标题的占位说明行（中文括号开头、非条目）
      if (i + 1 < lines.length && /^（/.test(lines[i + 1].trim())) {
        i++;
      }
      out.push(`- ${content}`);
      inserted = true;
      continue;
    }
    out.push(line);
  }
  if (!inserted) {
    out.push("");
    out.push(`## ${section}`);
    out.push(`- ${content}`);
  }
  return out.join("\n");
}

function hasDuplicate(indexText: string, section: string, content: string): boolean {
  const lines = indexText.split(/\r?\n/);
  let inSection = false;
  for (const line of lines) {
    if (/^##\s+/.test(line.trim())) {
      inSection = line.trim() === `## ${section}`;
      continue;
    }
    if (inSection && line.trim() === `- ${content}`) return true;
  }
  return false;
}

async function appendKnowledgeAudit(action: string, section: string, content: string): Promise<void> {
  const safe = content.replace(/\|/g, "／").replace(/\r?\n/g, " ");
  await appendText(PATHS.knowledgeAudit, `| ${today()} | ${readActiveTaskId()} | ${action} | ${section} | ${safe} |\n`);
}

function removeFromIndex(indexText: string, section: string, keyword: string): { text: string; removed: number } {
  const lines = indexText.split(/\r?\n/);
  const out: string[] = [];
  let inSection = false;
  let removed = 0;
  for (const line of lines) {
    if (/^##\s+/.test(line.trim())) {
      inSection = line.trim() === `## ${section}`;
      out.push(line);
      continue;
    }
    if (inSection && line.trim().startsWith("- ") && line.includes(keyword)) {
      removed++;
      continue;
    }
    out.push(line);
  }
  return { text: out.join("\n"), removed };
}

async function ensureKnowledge(): Promise<void> {
  if (!(await exists(PATHS.knowledgeIndex))) {
    throw new Error("knowledge 未初始化，请先执行 ledger init");
  }
}
