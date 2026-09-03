import { mkdir, readFile, writeFile, appendFile, access, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

export async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function readText(p: string): Promise<string> {
  return readFile(p, "utf8");
}

export async function readJson(p: string): Promise<unknown> {
  return JSON.parse(await readFile(p, "utf8"));
}

export async function writeText(p: string, content: string): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, "utf8");
}

export async function writeTextAtomic(p: string, content: string): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
  const temporary = `${p}.tmp`;
  await writeFile(temporary, content, "utf8");
  try {
    await rename(temporary, p);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function appendText(p: string, content: string): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
  await appendFile(p, content, "utf8");
}

export async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

export async function moveFile(from: string, to: string): Promise<void> {
  await mkdir(dirname(to), { recursive: true });
  await rename(from, to);
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
