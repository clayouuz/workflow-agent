export const BENCHMARK_STATUSES = ["pending", "in_progress", "blocked", "done", "obsolete"] as const;

export type BenchmarkStatus = (typeof BENCHMARK_STATUSES)[number];
export type AcceptanceMode = "auto" | "manual";
export type StepState = "pending" | "suspended" | "done";

export interface AcceptanceItem {
  id: string;
  mode: AcceptanceMode;
  description: string;
  done: boolean;
}

export interface BenchmarkStep {
  id: string;
  description: string;
  state: StepState;
}

export interface Bench {
  id: string;
  title: string;
  status: BenchmarkStatus;
  acceptanceItems: AcceptanceItem[];
  steps: BenchmarkStep[];
}

export function parseBenchmarks(text: string): Bench[] {
  const benches: Bench[] = [];
  let current: Bench | null = null;
  let section = "";

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = line.match(/^##\s+(\S+)\s+(.+?)\s*【(\w+)】\s*$/);
    if (heading) {
      if (current) benches.push(current);
      current = {
        id: heading[1],
        title: heading[2],
        status: normalizeStatus(heading[3]),
        acceptanceItems: [],
        steps: [],
      };
      section = "";
      continue;
    }
    if (!current) continue;

    if (/^###\s*验收/.test(line)) {
      section = "acceptance";
      continue;
    }
    if (/^###\s*步骤/.test(line)) {
      section = "steps";
      continue;
    }
    if (/^###/.test(line)) {
      section = "";
      continue;
    }

    if (section === "acceptance") {
      const item = parseAcceptance(line, current.id, current.acceptanceItems.length + 1);
      if (item) current.acceptanceItems.push(item);
    } else if (section === "steps") {
      const step = parseStep(line);
      if (step) current.steps.push(step);
    }
  }

  if (current) benches.push(current);
  return benches;
}

export function findBench(benches: Bench[], id: string): Bench | undefined {
  return benches.find((bench) => bench.id.toLowerCase() === id.toLowerCase());
}

export function findStep(bench: Bench, stepId: string): BenchmarkStep | undefined {
  return bench.steps.find((step) => step.id.toLowerCase() === stepId.toLowerCase());
}

export function findRunnableStep(bench: Bench): BenchmarkStep | undefined {
  return bench.steps.find((step) => step.state === "pending");
}

export function updateBenchmarkStatus(text: string, bid: string, status: BenchmarkStatus): string {
  const pattern = new RegExp(`^(##\\s+${escapeRegex(bid)}\\s+.+?)【\\w+】\\s*$`, "mi");
  if (!pattern.test(text)) throw new Error(`无法在 benchmarks.md 中定位 ${bid} 的标题行`);
  return text.replace(pattern, `$1【${status}】`);
}

export function updateStepState(text: string, bid: string, stepId: string, state: StepState): string {
  const lines = text.split(/\r?\n/);
  let inBenchmark = false;
  let inSteps = false;
  let updated = false;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const heading = line.match(/^##\s+(\S+)\s+/);
    if (heading) {
      inBenchmark = heading[1].toLowerCase() === bid.toLowerCase();
      inSteps = false;
      continue;
    }
    if (!inBenchmark) continue;
    if (/^###\s*步骤/.test(line.trim())) {
      inSteps = true;
      continue;
    }
    if (/^###/.test(line.trim())) {
      inSteps = false;
      continue;
    }
    if (!inSteps) continue;

    const match = line.match(/^(\s*[-*]\s*)\[(x| )\]\s*(\S+)\s*(.*)$/i);
    if (!match || match[3].toLowerCase() !== stepId.toLowerCase()) continue;
    const description = match[4].replace(/\s*【suspended】\s*$/, "").trim();
    const checkbox = state === "done" ? "x" : " ";
    const suffix = state === "suspended" ? " 【suspended】" : "";
    lines[index] = `${match[1]}[${checkbox}] ${match[3]}${description ? ` ${description}` : ""}${suffix}`;
    updated = true;
    break;
  }

  if (!updated) throw new Error(`找不到步骤: ${bid} / ${stepId}`);
  return lines.join("\n");
}

export function markAcceptanceItemsDone(text: string, bid: string, acceptanceIds: string[]): string {
  const wanted = new Set(acceptanceIds.map((id) => id.toLowerCase()));
  const lines = text.split(/\r?\n/);
  let inBenchmark = false;
  let inAcceptance = false;
  for (let index = 0; index < lines.length; index++) {
    const heading = lines[index].match(/^##\s+(\S+)\s+/);
    if (heading) {
      inBenchmark = heading[1].toLowerCase() === bid.toLowerCase();
      inAcceptance = false;
      continue;
    }
    if (!inBenchmark) continue;
    if (/^###\s*验收/.test(lines[index].trim())) {
      inAcceptance = true;
      continue;
    }
    if (/^###/.test(lines[index].trim())) {
      inAcceptance = false;
      continue;
    }
    if (!inAcceptance) continue;
    const item = lines[index].match(/^(\s*[-*]\s*)\[(x| )\]\s*(\S+)/i);
    if (item && wanted.has(item[3].toLowerCase())) lines[index] = lines[index].replace(/\[(x| )\]/i, "[x]");
  }
  return lines.join("\n");
}

function parseAcceptance(line: string, bid: string, ordinal: number): AcceptanceItem | null {
  const match = line.match(/^[-*]\s*\[(x| )\]\s*(?:(\S+)\s+\[(auto|manual)\]\s+)?(.+)$/i);
  if (!match) return null;
  return {
    id: match[2] ?? `${bid}-A${ordinal}`,
    mode: (match[3]?.toLowerCase() as AcceptanceMode | undefined) ?? "manual",
    description: match[4].trim(),
    done: match[1].toLowerCase() === "x",
  };
}

function parseStep(line: string): BenchmarkStep | null {
  const match = line.match(/^[-*]\s*\[(x| )\]\s*(\S+)\s*(.*)$/i);
  if (!match) return null;
  const suspended = /\s*【suspended】\s*$/.test(match[3]);
  return {
    id: match[2],
    description: match[3].replace(/\s*【suspended】\s*$/, "").trim(),
    state: match[1].toLowerCase() === "x" ? "done" : suspended ? "suspended" : "pending",
  };
}

function normalizeStatus(value: string): BenchmarkStatus {
  return (BENCHMARK_STATUSES as readonly string[]).includes(value) ? value as BenchmarkStatus : "pending";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
