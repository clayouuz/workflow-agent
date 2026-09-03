import { appendFile, cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import {
  CURRENT_SCHEMA_VERSION,
  legacyCocosTemplateRegistry,
  legacyManagedTemplateRegistry,
  templateRegistry,
  type TemplateEntry,
} from "./templates.ts";
import { exists } from "./fs.ts";
import { initialDelegationState, isDelegatedAuthority, writeDelegationState } from "./delegation.ts";
import { parseBenchmarks } from "./benchmarks.ts";
import { hashText } from "./hash.ts";
import {
  createCurrentWorkspaceSchema,
  digest,
  readWorkspaceSchema,
  writeWorkspaceSchema,
  type WorkspaceSchema,
} from "./workspace-schema.ts";

export interface MigrationResult {
  fromVersion: number;
  toVersion: number;
  updated: number;
  created: number;
  preserved: number;
  candidates: number;
  archived: number;
  alreadyCurrent: boolean;
}

const SCHEMA_FILE = "schema.json";
const STAGE_SUFFIX = ".migration-stage";
const BACKUP_SUFFIX = ".migration-backup";

export async function workspaceRequiresMigration(workspace: string): Promise<boolean> {
  if (!(await exists(workspace))) return false;
  if (await exists(join(workspace, SCHEMA_FILE))) {
    const schema = await readWorkspaceSchema(workspace);
    return !schema || schema.structureVersion !== CURRENT_SCHEMA_VERSION || schema.templateVersion !== CURRENT_SCHEMA_VERSION;
  }
  return (await readdir(workspace)).length > 0;
}

export async function initializeWorkspaceSchema(workspace: string): Promise<void> {
  if (await exists(join(workspace, SCHEMA_FILE))) return;
  await writeWorkspaceSchema(workspace, await createCurrentWorkspaceSchema());
}

export async function migrateWorkspace(workspace: string): Promise<MigrationResult> {
  const root = resolve(workspace);
  if (!(await exists(root))) throw new Error(`工作区不存在: ${root}`);

  const existingSchema = await readWorkspaceSchema(root);
  if (
    existingSchema?.structureVersion === CURRENT_SCHEMA_VERSION &&
    existingSchema.templateVersion === CURRENT_SCHEMA_VERSION
  ) {
    return emptyResult(CURRENT_SCHEMA_VERSION, true);
  }

  const fromVersion = existingSchema?.structureVersion ?? 1;
  if (fromVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`工作区结构版本 ${fromVersion} 高于工具支持的版本 ${CURRENT_SCHEMA_VERSION}`);
  }

  const stage = `${root}${STAGE_SUFFIX}`;
  const backup = `${root}${BACKUP_SUFFIX}`;
  await recoverInterruptedCommit(root, stage, backup);
  await cp(root, stage, { recursive: true, force: false, errorOnExist: true });

  try {
    const result = await migrateStagedWorkspace(stage, fromVersion, existingSchema);
    await commitStagedWorkspace(root, stage, backup);
    return result;
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

export async function restoreArchivedWorkspaceFile(workspace: string, originalPath: string): Promise<string> {
  const root = resolve(workspace);
  const schema = await readWorkspaceSchema(root);
  if (!schema) throw new Error("工作区没有结构清单，无法定位归档");
  const normalized = normalizeRelativePath(originalPath);
  const archived = schema.archives.find((item) => item.originalPath === normalized);
  if (!archived) throw new Error(`没有找到可恢复归档: ${normalized}`);

  const source = safePath(root, archived.archivePath);
  const target = safePath(root, archived.originalPath);
  if (await exists(target)) throw new Error(`目标已存在，不会覆盖: ${archived.originalPath}`);
  const content = await readFile(source);
  if (digest(content) !== archived.digest) throw new Error(`归档内容指纹不匹配: ${archived.archivePath}`);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, { flag: "wx" });
  return archived.originalPath;
}

async function migrateStagedWorkspace(
  stage: string,
  fromVersion: number,
  previousSchema: WorkspaceSchema | null,
): Promise<MigrationResult> {
  const taskIds = await listTaskIds(stage);
  const schema = await createCurrentWorkspaceSchema(previousSchema);
  const result = emptyResult(fromVersion, false);

  for (const entry of templateRegistry) {
    const targets = entry.scope === "shared"
      ? [entry.relativePath]
      : taskIds.map((taskId) => `tasks/${taskId}/${entry.relativePath}`);
    for (const targetRelative of targets) {
      await migrateTemplate(stage, entry, targetRelative, schema, result);
    }
  }

  for (const legacy of legacyManagedTemplateRegistry) {
    if (legacy.relativePath === "ledger/designs/template-cocos-scene.md") continue;
    if (templateRegistry.some((entry) => entry.scope === legacy.scope && entry.relativePath === legacy.relativePath)) {
      continue;
    }
    const obsoletePaths = legacy.scope === "shared"
      ? [legacy.relativePath]
      : taskIds.map((taskId) => `tasks/${taskId}/${legacy.relativePath}`);
    for (const obsoletePath of obsoletePaths) {
      await archiveObsoleteFile(stage, obsoletePath, fromVersion, schema, result);
    }
  }

  // Cocos used to be generated by core initialization. Only an unmodified
  // official file is obsolete; a custom file is evidence to preserve, not proof of enablement.
  await migrateLegacyCocosTemplates(stage, taskIds, fromVersion, schema, result);

  if (fromVersion < 8) {
    for (const taskId of taskIds) await migrateLegacyBenchmarkStateV8(stage, taskId, fromVersion, schema, result);
  }

  // v5 allowed delegated tasks to self-approve designs. Do not carry that
  // implicit approval into v6: preserve the boundary and require a fresh discussion chain.
  for (const taskId of taskIds) {
    const authority = join(stage, "tasks", taskId, "ledger", "authority.md");
    const state = join(stage, "tasks", taskId, "ledger", "delegation-state.json");
    if (await exists(authority) && !(await exists(state)) && isDelegatedAuthority(await readFile(authority, "utf8"))) {
      await writeDelegationState(state, initialDelegationState("迁移保留既有委托边界；设计讨论与用户确认需重新记录"));
      result.created++;
    }
  }

  await writeWorkspaceSchema(stage, schema);
  await validateStagedWorkspace(stage, schema);
  return result;
}

async function migrateLegacyBenchmarkStateV8(
  stage: string,
  taskId: string,
  fromVersion: number,
  schema: WorkspaceSchema,
  result: MigrationResult,
): Promise<void> {
  const ledger = join(stage, "tasks", taskId, "ledger");
  const oldPath = join(ledger, "benchmarks.md");
  if (!(await exists(oldPath))) return;
  const oldText = await readFile(oldPath, "utf8");
  const benches = parseBenchmarks(oldText);
  if (benches.length === 0) return;

  const originalRelative = `tasks/${taskId}/ledger/benchmarks.md`;
  const archiveRelative = `migration/archive/v${fromVersion}/${originalRelative}`;
  const archive = safePath(stage, archiveRelative);
  if (!(await exists(archive))) {
    await mkdir(dirname(archive), { recursive: true });
    await writeFile(archive, oldText, { encoding: "utf8", flag: "wx" });
    schema.archives.push({ originalPath: originalRelative, archivePath: archiveRelative, digest: digest(oldText) });
    result.archived++;
  }

  const timestamp = new Date().toISOString();
  const eventFile = join(ledger, "machine-events", `${timestamp.slice(0, 7)}.ndjson`);
  const projection = ["# Benchmark 清单", "", "> 本文件由 workflow-agent 生成，请勿直接编辑。", ""];
  for (const bench of benches) {
    const contract = `# ${bench.title}\n\n## 结果\n${bench.title}\n\n## Environment\n待从旧台账确认。\n\n## Entry\n待从旧台账确认。\n\n## Fixture\n待从旧台账确认。\n\n## Action\n待从旧台账确认。\n\n## Oracle\n待从旧台账确认。\n\n## Acceptance\n${bench.acceptanceItems.map((item) => `- ${item.id} [${item.mode}] ${item.description}`).join("\n") || "- 待补充 [manual] 待补充验收标准"}\n\n## Exclusions\n待从旧台账确认。\n`;
    const contractPath = join(ledger, "benchmarks", `${bench.id}.md`);
    await mkdir(dirname(contractPath), { recursive: true });
    if (!(await exists(contractPath))) await writeFile(contractPath, contract, "utf8");
    const verificationPath = join(ledger, "verification", `${bench.id}.json`);
    let valid = false;
    if (await exists(verificationPath)) {
      try { valid = JSON.parse(await readFile(verificationPath, "utf8")).status === "valid"; } catch { valid = false; }
    }
    const phase = bench.status === "done" ? (valid ? "accepted" : "verifying") : bench.status === "obsolete" ? "obsolete" : bench.status === "pending" ? "draft" : "ready";
    const state = { id: bench.id, title: bench.title, reference: `ledger/benchmarks/${bench.id}.md`, phase, hold: bench.status === "blocked" ? { reason: "从旧 blocked 状态迁移" } : null, contractDigest: await hashText(contract), verificationStatus: valid ? "valid" : null };
    await mkdir(join(ledger, "state", "benchmarks"), { recursive: true });
    await writeFile(join(ledger, "state", "benchmarks", `${bench.id}.json`), JSON.stringify(state, null, 2) + "\n", "utf8");
    await mkdir(dirname(eventFile), { recursive: true });
    await appendFile(eventFile, JSON.stringify({ version: 1, timestamp, taskId, aggregate: "benchmark", aggregateId: bench.id, type: "legacy_state_migrated", state, reason: `v${fromVersion} -> v8` }) + "\n", "utf8");
    projection.push(`## ${bench.id} ${bench.title} 【${phase}】`, "", "### 验收标准", ...bench.acceptanceItems.map((item) => `- [ ] ${item.id} [${item.mode}] ${item.description}`), "");

    for (const step of bench.steps) {
      const workContent = `# ${step.id} ${step.description}\n\n## 预期结果\n${step.description}\n\n## 影响模块\n待确认。\n\n## 工作内容\n${step.description}\n\n## 验证\n关联 ${bench.id}。\n`;
      const workPath = join(ledger, "work-items", `${step.id}.md`);
      await mkdir(dirname(workPath), { recursive: true });
      if (!(await exists(workPath))) await writeFile(workPath, workContent, "utf8");
      const workState = { id: step.id, title: step.description, reference: `ledger/work-items/${step.id}.md`, phase: step.state === "done" ? "done" : "pending", hold: step.state === "suspended" ? { reason: "从旧 suspended 状态迁移" } : null, documentDigest: await hashText(workContent), benchmarks: [bench.id] };
      await mkdir(join(ledger, "state", "work-items"), { recursive: true });
      await writeFile(join(ledger, "state", "work-items", `${step.id}.json`), JSON.stringify(workState, null, 2) + "\n", "utf8");
      await appendFile(eventFile, JSON.stringify({ version: 1, timestamp, taskId, aggregate: "work_item", aggregateId: step.id, type: "legacy_state_migrated", state: workState, reason: `v${fromVersion} -> v8` }) + "\n", "utf8");
    }
  }
  await writeFile(oldPath, projection.join("\n"), "utf8");
}

async function migrateTemplate(
  stage: string,
  entry: TemplateEntry,
  targetRelative: string,
  schema: WorkspaceSchema,
  result: MigrationResult,
): Promise<void> {
  const target = safePath(stage, targetRelative);
  const targetContent = await readFile(entry.sourcePath, "utf8");
  if (!(await exists(target))) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, targetContent, { encoding: "utf8", flag: "wx" });
    result.created++;
    return;
  }

  if (!entry.managed) {
    result.preserved++;
    return;
  }

  const current = await readFile(target, "utf8");
  if (sameText(current, targetContent)) return;

  const legacyTemplates = legacyManagedTemplateRegistry.filter(
    (item) => item.scope === entry.scope && item.relativePath === entry.relativePath,
  );
  if (await matchesAnyLegacyTemplate(current, legacyTemplates)) {
    await writeFile(target, targetContent, "utf8");
    result.updated++;
    return;
  }

  const candidateRelative = `migration/candidates/v${CURRENT_SCHEMA_VERSION}/${targetRelative}`;
  const candidate = safePath(stage, candidateRelative);
  if (await exists(candidate)) throw new Error(`迁移候选目标已存在: ${candidateRelative}`);
  await mkdir(dirname(candidate), { recursive: true });
  await writeFile(candidate, targetContent, { encoding: "utf8", flag: "wx" });
  schema.candidates.push({
    originalPath: targetRelative,
    candidatePath: candidateRelative,
    templateVersion: CURRENT_SCHEMA_VERSION,
  });
  result.preserved++;
  result.candidates++;
}

async function migrateLegacyCocosTemplates(
  stage: string,
  taskIds: string[],
  fromVersion: number,
  schema: WorkspaceSchema,
  result: MigrationResult,
): Promise<void> {
  for (const taskId of taskIds) {
    const relativePath = `tasks/${taskId}/ledger/designs/template-cocos-scene.md`;
    const target = safePath(stage, relativePath);
    if (!(await exists(target))) continue;
    const content = await readFile(target, "utf8");
    if (!(await matchesAnyLegacyTemplate(content, legacyCocosTemplateRegistry))) continue;
    await archiveObsoleteFile(stage, relativePath, fromVersion, schema, result);
  }
}

async function matchesAnyLegacyTemplate(content: string, entries: TemplateEntry[]): Promise<boolean> {
  for (const entry of entries) {
    if (sameText(content, await readFile(entry.sourcePath, "utf8"))) return true;
  }
  return false;
}

async function archiveObsoleteFile(
  stage: string,
  originalRelative: string,
  fromVersion: number,
  schema: WorkspaceSchema,
  result: MigrationResult,
): Promise<void> {
  const original = safePath(stage, originalRelative);
  if (!(await exists(original))) return;
  const archiveRelative = `migration/archive/v${fromVersion}/${originalRelative}`;
  const archive = safePath(stage, archiveRelative);
  if (await exists(archive)) throw new Error(`迁移归档目标已存在: ${archiveRelative}`);
  const content = await readFile(original);
  await mkdir(dirname(archive), { recursive: true });
  await writeFile(archive, content, { flag: "wx" });
  await rm(original);
  schema.archives.push({ originalPath: originalRelative, archivePath: archiveRelative, digest: digest(content) });
  result.archived++;
}

async function validateStagedWorkspace(stage: string, schema: WorkspaceSchema): Promise<void> {
  const saved = await readWorkspaceSchema(stage);
  if (!saved || saved.structureVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error("迁移暂存工作区的结构清单无效");
  }
  for (const item of schema.candidates) await readFile(safePath(stage, item.candidatePath));
  for (const item of schema.archives) {
    const content = await readFile(safePath(stage, item.archivePath));
    if (digest(content) !== item.digest) throw new Error(`迁移归档校验失败: ${item.archivePath}`);
  }
}

async function commitStagedWorkspace(root: string, stage: string, backup: string): Promise<void> {
  try {
    await rename(root, backup);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EPERM" && code !== "EACCES") throw error;
    await cp(root, backup, { recursive: true, force: false, errorOnExist: true });
    try {
      await replaceDirectoryContents(root, stage);
    } catch (replaceError) {
      await replaceDirectoryContents(root, backup);
      throw replaceError;
    }
    await rm(stage, { recursive: true, force: true });
    await rm(backup, { recursive: true, force: true });
    return;
  }
  try {
    await rename(stage, root);
  } catch (error) {
    await rename(backup, root);
    throw error;
  }
  await rm(backup, { recursive: true, force: true });
}

async function replaceDirectoryContents(target: string, source: string): Promise<void> {
  for (const entry of await readdir(target)) await rm(join(target, entry), { recursive: true, force: true });
  for (const entry of await readdir(source)) await cp(join(source, entry), join(target, entry), { recursive: true, force: false, errorOnExist: true });
}

async function recoverInterruptedCommit(root: string, stage: string, backup: string): Promise<void> {
  if (await exists(stage)) await rm(stage, { recursive: true, force: true });
  if (!(await exists(backup))) return;
  if (await exists(root)) {
    await rm(backup, { recursive: true, force: true });
  } else {
    await rename(backup, root);
  }
}

async function listTaskIds(workspace: string): Promise<string[]> {
  const root = join(workspace, "tasks");
  try {
    return (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function emptyResult(fromVersion: number, alreadyCurrent: boolean): MigrationResult {
  return {
    fromVersion,
    toVersion: CURRENT_SCHEMA_VERSION,
    updated: 0,
    created: 0,
    preserved: 0,
    candidates: 0,
    archived: 0,
    alreadyCurrent,
  };
}

function safePath(root: string, relativePath: string): string {
  if (isAbsolute(relativePath)) throw new Error(`迁移路径必须是相对路径: ${relativePath}`);
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, ...normalizeRelativePath(relativePath).split("/"));
  if (target !== resolvedRoot && !target.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`迁移路径超出工作区: ${relativePath}`);
  }
  return target;
}

function normalizeRelativePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  if (!normalized || segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`无效工作区相对路径: ${path}`);
  }
  return normalized;
}

function sameText(left: string, right: string): boolean {
  return left.replaceAll("\r\n", "\n") === right.replaceAll("\r\n", "\n");
}
