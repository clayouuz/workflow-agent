import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { appendText, exists, writeTextAtomic } from "./fs.ts";
import { PATHS, readActiveTaskId } from "./workspace.ts";

export type MachineAggregate = "benchmark" | "work_item" | "discussion";

export interface MachineEvent {
  version: 1;
  timestamp: string;
  taskId: string;
  aggregate: MachineAggregate;
  aggregateId: string;
  type: string;
  state: unknown;
  reason?: string;
}

export async function appendMachineEvent(event: Omit<MachineEvent, "version" | "timestamp" | "taskId">): Promise<MachineEvent> {
  const record: MachineEvent = { version: 1, timestamp: new Date().toISOString(), taskId: readActiveTaskId(), ...event };
  const path = join(PATHS.machineEvents, `${record.timestamp.slice(0, 7)}.ndjson`);
  // The event is written before replaceable state/projections so repair can replay a partially completed command.
  await appendText(path, `${JSON.stringify(record)}\n`);
  return record;
}

export async function readMachineEvents(): Promise<MachineEvent[]> {
  if (!(await exists(PATHS.machineEvents))) return [];
  const files = (await readdir(PATHS.machineEvents)).filter((name) => /^\d{4}-\d{2}\.ndjson$/.test(name)).sort();
  const events: MachineEvent[] = [];
  for (const file of files) {
    const lines = (await readFile(join(PATHS.machineEvents, file), "utf8")).split(/\r?\n/).filter(Boolean);
    for (let index = 0; index < lines.length; index++) {
      try { events.push(JSON.parse(lines[index]) as MachineEvent); }
      catch { throw new Error(`Machine Event 损坏: ${file}:${index + 1}`); }
    }
  }
  return events;
}

export async function writeAggregateState(aggregate: MachineAggregate, id: string, state: unknown): Promise<void> {
  const root = aggregate === "benchmark" ? PATHS.benchmarkState : aggregate === "work_item" ? PATHS.workItemState : PATHS.ledger;
  if (aggregate === "discussion") {
    await writeTextAtomic(PATHS.discussionState, JSON.stringify(state, null, 2) + "\n");
    return;
  }
  await writeTextAtomic(join(root, `${id}.json`), JSON.stringify(state, null, 2) + "\n");
}
