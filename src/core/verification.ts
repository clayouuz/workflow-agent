import { join } from "node:path";
import { exists, readJson, writeTextAtomic } from "./fs.ts";
import { fingerprintTestInputs } from "./hash.ts";
import type { ContentFingerprint } from "./hash.ts";
import { findBench, parseBenchmarks } from "./benchmarks.ts";
import type { Bench } from "./benchmarks.ts";
import type { RunSummary } from "./test-runner.ts";
import { readConfig } from "./test-config.ts";
import { PATHS } from "./workspace.ts";
import { readText } from "./fs.ts";
import { readBenchmarkState } from "./projections.ts";
import { readBenchmarkContract } from "./semantic-documents.ts";

export type VerificationStatus = "valid" | "failed" | "stale" | "incomplete";

export interface AcceptanceEvidence {
  tests: string[];
  passed: boolean;
}

export interface ManualEvidence {
  result: "pass" | "fail";
  note: string;
  recordedAt: string;
}

export interface VerificationRecord {
  benchmarkId: string;
  status: VerificationStatus;
  automatic: {
    run: RunSummary | null;
    acceptance: Record<string, AcceptanceEvidence>;
  };
  manual: Record<string, ManualEvidence>;
  fingerprint: ContentFingerprint | null;
  checkedAt: string;
}

export function verificationPath(bid: string): string {
  return join(PATHS.verification, `${bid}.json`);
}

export function createVerificationRecord(bid: string): VerificationRecord {
  return {
    benchmarkId: bid,
    status: "incomplete",
    automatic: { run: null, acceptance: {} },
    manual: {},
    fingerprint: null,
    checkedAt: new Date().toISOString(),
  };
}

export async function readVerificationRecord(bid: string): Promise<VerificationRecord | null> {
  const path = verificationPath(bid);
  if (!(await exists(path))) return null;
  return (await readJson(path)) as VerificationRecord;
}

export async function writeVerificationRecord(record: VerificationRecord): Promise<void> {
  record.checkedAt = new Date().toISOString();
  await writeTextAtomic(verificationPath(record.benchmarkId), JSON.stringify(record, null, 2) + "\n");
}

export function buildAutomaticAcceptance(bench: Bench, run: RunSummary): Record<string, AcceptanceEvidence> {
  const evidence: Record<string, AcceptanceEvidence> = {};
  for (const item of bench.acceptanceItems.filter((candidate) => candidate.mode === "auto")) {
    const marker = item.id.replaceAll("-", "_").toLowerCase();
    const matched: Array<{ name: string; ok: boolean }> = [];
    for (const file of run.files) {
      for (const testCase of file.cases) {
        const normalized = testCase.name.toLowerCase();
        const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
        const markerTokens = marker.split("_");
        if (containsSequence(tokens, markerTokens)) matched.push({ name: `${file.file}::${testCase.name}`, ok: testCase.ok });
      }
    }
    evidence[item.id] = {
      tests: matched.map((entry) => entry.name),
      passed: matched.length > 0 && matched.every((entry) => entry.ok),
    };
  }
  return evidence;
}

export async function evaluateVerification(record: VerificationRecord, bench?: Bench): Promise<VerificationStatus> {
  const target = bench ?? await readBenchmark(record.benchmarkId);
  const currentFingerprint = await fingerprintTestInputs(await readConfig());
  const run = record.automatic.run;

  let status: VerificationStatus;
  if ((run?.failed ?? 0) > 0 || Object.values(record.manual).some((item) => item.result === "fail")) {
    status = "failed";
  } else if (record.fingerprint && record.fingerprint.digest !== currentFingerprint.digest) {
    status = "stale";
  } else {
    const automaticComplete = target.acceptanceItems
      .filter((item) => item.mode === "auto")
      .every((item) => record.automatic.acceptance[item.id]?.passed === true);
    const manualComplete = target.acceptanceItems
      .filter((item) => item.mode === "manual")
      .every((item) => record.manual[item.id]?.result === "pass");
    const runComplete = Boolean(run && run.total > 0 && !run.interrupted);
    status = automaticComplete && manualComplete && runComplete ? "valid" : "incomplete";
  }
  record.status = status;
  record.checkedAt = new Date().toISOString();
  return status;
}

export async function readBenchmark(bid: string): Promise<Bench> {
  try {
    const state = await readBenchmarkState(bid);
    const contract = await readBenchmarkContract(bid, state.reference);
    return {
      id: bid,
      title: state.title,
      status: "in_progress",
      acceptanceItems: contract.acceptance.map((item) => ({ ...item, done: state.phase === "accepted" })),
      steps: [],
    };
  } catch (error) {
    if (!(error instanceof Error) || !/未注册/.test(error.message)) throw error;
  }
  const bench = findBench(parseBenchmarks(await readText(PATHS.benchmarks)), bid);
  if (!bench) throw new Error(`找不到 benchmark: ${bid}`);
  return bench;
}

function containsSequence(tokens: string[], sequence: string[]): boolean {
  if (sequence.length === 0 || tokens.length < sequence.length) return false;
  for (let start = 0; start <= tokens.length - sequence.length; start++) {
    if (sequence.every((token, offset) => tokens[start + offset] === token)) return true;
  }
  return false;
}
