import { WORKSPACE, readActiveTaskId } from "../core/workspace.ts";
import { disableTaskPack, enableTaskPack, listTaskPacks } from "../core/packs.ts";

export async function ledgerPackList(): Promise<void> {
  const taskId = readActiveTaskId();
  console.log(`当前任务: ${taskId}`);
  for (const pack of await listTaskPacks(WORKSPACE, taskId)) {
    console.log(`${pack.id}\t${pack.enabled ? "已启用" : "未启用"}\t${pack.description}`);
  }
}

export async function ledgerPackEnable(args: string[]): Promise<void> {
  const [packId] = args;
  if (!packId || args.length !== 1) throw new Error("用法: ledger pack enable <pack>");
  const taskId = readActiveTaskId();
  const changed = await enableTaskPack(WORKSPACE, taskId, packId);
  console.log(changed ? `已为任务 ${taskId} 启用 pack: ${packId}` : `任务 ${taskId} 已启用 pack: ${packId}`);
  console.log("特化内容不会自动进入上下文；请按当前工作需要引用对应模板。");
}

export async function ledgerPackDisable(args: string[]): Promise<void> {
  const [packId] = args;
  if (!packId || args.length !== 1) throw new Error("用法: ledger pack disable <pack>");
  const taskId = readActiveTaskId();
  const changed = await disableTaskPack(WORKSPACE, taskId, packId);
  console.log(changed ? `已为任务 ${taskId} 停用 pack: ${packId}` : `任务 ${taskId} 未启用 pack: ${packId}`);
}
