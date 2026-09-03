import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { exists, writeTextAtomic } from "./fs.ts";
import { CURRENT_SCHEMA_VERSION, templateRegistry } from "./templates.ts";

export interface ArchivedWorkspaceFile {
  originalPath: string;
  archivePath: string;
  digest: string;
}

export interface CandidateWorkspaceFile {
  originalPath: string;
  candidatePath: string;
  templateVersion: number;
}

export interface WorkspaceSchema {
  structureVersion: number;
  templateVersion: number;
  templateFingerprints: Record<string, string>;
  candidates: CandidateWorkspaceFile[];
  archives: ArchivedWorkspaceFile[];
  taskPacks: Record<string, string[]>;
}

export async function readWorkspaceSchema(workspace: string): Promise<WorkspaceSchema | null> {
  const path = join(workspace, "schema.json");
  if (!(await exists(path))) return null;
  const parsed = JSON.parse(await readFile(path, "utf8")) as Partial<WorkspaceSchema>;
  if (!Number.isInteger(parsed.structureVersion) || !Number.isInteger(parsed.templateVersion)) {
    throw new Error("schema.json 缺少有效的结构版本或模板版本");
  }
  return normalizeSchema(parsed);
}

export async function createCurrentWorkspaceSchema(previous?: WorkspaceSchema | null): Promise<WorkspaceSchema> {
  const templateFingerprints: Record<string, string> = {};
  for (const entry of templateRegistry) {
    templateFingerprints[entry.relativePath] = digest(await readFile(entry.sourcePath));
  }
  return normalizeSchema({
    structureVersion: CURRENT_SCHEMA_VERSION,
    templateVersion: CURRENT_SCHEMA_VERSION,
    templateFingerprints,
    // Existing migration records survive schema upgrades so old restore targets remain usable.
    candidates: previous?.candidates ?? [],
    archives: previous?.archives ?? [],
    taskPacks: previous?.taskPacks ?? {},
  });
}

export async function writeWorkspaceSchema(workspace: string, schema: WorkspaceSchema): Promise<void> {
  await writeTextAtomic(join(workspace, "schema.json"), JSON.stringify(normalizeSchema(schema), null, 2) + "\n");
}

export function normalizeSchema(input: Partial<WorkspaceSchema>): WorkspaceSchema {
  const taskPacks: Record<string, string[]> = {};
  for (const [taskId, packs] of Object.entries(input.taskPacks ?? {})) {
    const normalized = Array.isArray(packs)
      ? [...new Set(packs.filter((pack): pack is string => typeof pack === "string"))].sort()
      : [];
    if (normalized.length > 0) taskPacks[taskId] = normalized;
  }
  return {
    structureVersion: input.structureVersion ?? CURRENT_SCHEMA_VERSION,
    templateVersion: input.templateVersion ?? CURRENT_SCHEMA_VERSION,
    templateFingerprints: input.templateFingerprints ?? {},
    candidates: input.candidates ?? [],
    archives: input.archives ?? [],
    taskPacks,
  };
}

export function digest(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
