import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { registerTestCleanup } from "../../src/core/test-runner.ts";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = join(REPO_ROOT, "src", "cli.ts");
const WORKER = join(REPO_ROOT, "tests", "helpers", "cli-worker.ts");

interface PendingRequest { resolve: (output: string) => void; reject: (error: Error) => void }
interface CliWorker {
  child: ChildProcessWithoutNullStreams;
  pending: Map<number, PendingRequest>;
  nextId: number;
}
interface WorkspaceSlot { root: string; inUse: boolean; worker?: CliWorker }
const workspaceSlots: WorkspaceSlot[] = [];
let exitCleanupRegistered = false;
registerTestCleanup(closeTestWorkspaceWorkers);

export interface TestWorkspace {
  root: string;
  workflow: string;
  run(...args: string[]): Promise<string>;
  write(relativePath: string, content: string): Promise<void>;
  cleanup(): Promise<void>;
}

export async function createTestWorkspace(): Promise<TestWorkspace> {
  let slot = workspaceSlots.find((item) => !item.inUse);
  if (!slot) {
    slot = { root: await mkdtemp(join(tmpdir(), "workflow-agent-test-")), inUse: false };
    workspaceSlots.push(slot);
  }
  await clearWorkspaceRoot(slot.root);
  slot.inUse = true;
  slot.worker ??= startWorker(slot.root);
  registerExitCleanup();
  const root = slot.root;
  const workflow = join(root, ".workflow");
  let released = false;
  return {
    root,
    workflow,
    async run(...args: string[]): Promise<string> {
      if (process.env.WORKFLOW_TEST_USE_WORKER === "0") return runOneShot(root, workflow, args);
      // Test commands dynamically import user fixture modules; run them in a fresh process
      // so ESM module caches cannot leak source content between reused workspace slots.
      if (args[0] === "test" && (args[1] === "run" || args[1] === "impact")) return runOneShot(root, workflow, args);
      return runWorker(slot!.worker!, args);
    },
    async write(relativePath: string, content: string): Promise<void> {
      const target = join(workflow, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    },
    async cleanup(): Promise<void> {
      if (released) return;
      released = true;
      slot!.inUse = false;
    },
  };
}

async function clearWorkspaceRoot(root: string): Promise<void> {
  for (const entry of await readdir(root)) await rm(join(root, entry), { recursive: true, force: true });
}

function startWorker(root: string): CliWorker {
  const child = spawn(process.execPath, [WORKER], {
    cwd: root,
    env: { ...process.env, WORKFLOW_WORKSPACE: join(root, ".workflow") },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const worker: CliWorker = { child, pending: new Map(), nextId: 1 };
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  lines.on("line", (line) => {
    try {
      const response = JSON.parse(line) as { id: number; code: number; output: string };
      const pending = worker.pending.get(response.id);
      if (!pending) return;
      worker.pending.delete(response.id);
      if (response.code !== 0) pending.reject(Object.assign(new Error(response.output), { stdout: response.output, stderr: "" }));
      else pending.resolve(response.output);
    } catch (error) {
      for (const pending of worker.pending.values()) pending.reject(error instanceof Error ? error : new Error(String(error)));
      worker.pending.clear();
    }
  });
  child.on("exit", (code, signal) => {
    const error = new Error(`CLI worker 已退出（code=${code ?? "null"}, signal=${signal ?? "none"}）`);
    for (const pending of worker.pending.values()) pending.reject(error);
    worker.pending.clear();
  });
  return worker;
}

function runWorker(worker: CliWorker, args: string[]): Promise<string> {
  const id = worker.nextId++;
  return new Promise((resolve, reject) => {
    worker.pending.set(id, { resolve, reject });
    worker.child.stdin.write(`${JSON.stringify({ id, args })}\n`, (error) => {
      if (!error) return;
      worker.pending.delete(id);
      reject(error);
    });
  });
}

async function runOneShot(root: string, workflow: string, args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], {
      cwd: root,
      env: { ...process.env, WORKFLOW_WORKSPACE: workflow, WORKFLOW_TEST_USE_WORKER: "0" },
      encoding: "utf8",
    });
    return stdout + stderr;
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    failure.message += `\n${failure.stdout ?? ""}${failure.stderr ?? ""}`;
    throw failure;
  }
}

export async function closeTestWorkspaceWorkers(): Promise<void> {
  await Promise.all(workspaceSlots.map(async (slot) => {
    const worker = slot.worker;
    if (!worker || worker.child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      worker.child.once("exit", () => resolve());
      worker.child.kill();
    });
  }));
  for (const slot of workspaceSlots) await rm(slot.root, { recursive: true, force: true });
  workspaceSlots.length = 0;
}

function registerExitCleanup(): void {
  if (exitCleanupRegistered) return;
  exitCleanupRegistered = true;
  process.once("exit", () => {
    for (const slot of workspaceSlots) {
      slot.worker?.child.kill();
      rmSync(slot.root, { recursive: true, force: true });
    }
  });
}
