import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { exists } from "./fs.ts";
import { packRegistry, CURRENT_SCHEMA_VERSION, type TemplatePack } from "./templates.ts";
import { readWorkspaceSchema, writeWorkspaceSchema, type WorkspaceSchema } from "./workspace-schema.ts";

export interface PackStatus {
  id: string;
  description: string;
  enabled: boolean;
}

export async function listTaskPacks(workspace: string, taskId: string): Promise<PackStatus[]> {
  const schema = await requireCurrentSchema(workspace);
  const enabled = new Set(schema.taskPacks[taskId] ?? []);
  return packRegistry.map((pack) => ({ id: pack.id, description: pack.description, enabled: enabled.has(pack.id) }));
}

export async function enableTaskPack(workspace: string, taskId: string, packId: string): Promise<boolean> {
  const schema = await requireCurrentSchema(workspace);
  const pack = requirePack(packId);
  const taskRoot = resolve(workspace, "tasks", taskId, "ledger");
  if (!(await exists(taskRoot))) throw new Error(`当前任务不存在或未初始化: ${taskId}`);

  const created: string[] = [];
  for (const entry of pack.entries) {
    const target = safeTaskPath(taskRoot, entry.relativePath);
    if (await exists(target)) {
      const info = await stat(target);
      if (!info.isFile()) throw new Error(`pack 目标不是文件: ${entry.relativePath}`);
    }
  }

  try {
    for (const entry of pack.entries) {
      const target = safeTaskPath(taskRoot, entry.relativePath);
      if (await exists(target)) continue;
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, await readFile(entry.sourcePath), { flag: "wx" });
      created.push(target);
    }

    const current = schema.taskPacks[taskId] ?? [];
    if (current.includes(pack.id)) return false;
    schema.taskPacks[taskId] = [...current, pack.id].sort();
    await writeWorkspaceSchema(workspace, schema);
    return true;
  } catch (error) {
    // Only files created by this call are rolled back; pre-existing custom files belong to the user.
    for (const target of created.reverse()) await rm(target, { force: true });
    throw error;
  }
}

export async function disableTaskPack(workspace: string, taskId: string, packId: string): Promise<boolean> {
  const schema = await requireCurrentSchema(workspace);
  const pack = requirePack(packId);
  const current = schema.taskPacks[taskId] ?? [];
  if (!current.includes(pack.id)) return false;

  const taskRoot = resolve(workspace, "tasks", taskId, "ledger");
  const removable: Array<{ path: string; content: Buffer }> = [];
  for (const entry of pack.entries) {
    const target = safeTaskPath(taskRoot, entry.relativePath);
    if (!(await exists(target))) continue;
    const actual = await readFile(target);
    const official = await readFile(entry.sourcePath);
    if (!actual.equals(official)) {
      throw new Error(`检测到自定义 pack 文件，不会删除: ${entry.relativePath}`);
    }
    removable.push({ path: target, content: actual });
  }

  try {
    for (const item of removable) await rm(item.path);
    const remaining = current.filter((id) => id !== pack.id);
    if (remaining.length > 0) schema.taskPacks[taskId] = remaining;
    else delete schema.taskPacks[taskId];
    await writeWorkspaceSchema(workspace, schema);
    return true;
  } catch (error) {
    for (const item of removable) {
      if (!(await exists(item.path))) {
        await mkdir(dirname(item.path), { recursive: true });
        await writeFile(item.path, item.content, { flag: "wx" });
      }
    }
    throw error;
  }
}

async function requireCurrentSchema(workspace: string): Promise<WorkspaceSchema> {
  const schema = await readWorkspaceSchema(workspace);
  if (!schema) throw new Error("工作区未初始化，请先执行 ledger init");
  if (schema.structureVersion !== CURRENT_SCHEMA_VERSION || schema.templateVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`工作区仍是 v${schema.structureVersion}，请先执行 ledger migrate`);
  }
  return schema;
}

function requirePack(packId: string): TemplatePack {
  const pack = packRegistry.find((item) => item.id === packId);
  if (!pack) throw new Error(`未知 pack: ${packId}。可用: ${packRegistry.map((item) => item.id).join(", ")}`);
  return pack;
}

function safeTaskPath(taskRoot: string, relativePath: string): string {
  if (isAbsolute(relativePath)) throw new Error(`pack 路径必须是相对路径: ${relativePath}`);
  const segments = relativePath.replaceAll("\\", "/").split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`无效 pack 路径: ${relativePath}`);
  }
  const root = resolve(taskRoot);
  const target = resolve(root, ...segments);
  if (!target.startsWith(`${root}${sep}`)) throw new Error(`pack 路径超出任务台账: ${relativePath}`);
  return target;
}
