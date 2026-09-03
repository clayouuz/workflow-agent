import { appendText, readText, today } from "./fs.ts";

export interface HistoryEvent {
  date: string;
  type: string;
  content: string;
  reason: string;
}

export function formatHistoryEvent(type: string, content: string, reason = "-"): string {
  return `- ${today()}: ${clean(type)} | ${clean(content)} | ${clean(reason || "-")}\n`;
}

export async function appendHistoryEvent(file: string, type: string, content: string, reason = "-"): Promise<void> {
  await appendText(file, formatHistoryEvent(type, content, reason));
}

export async function readHistoryEvents(file: string): Promise<HistoryEvent[]> {
  try {
    return parseHistoryEvents(await readText(file));
  } catch {
    return [];
  }
}

export function parseHistoryEvents(text: string): HistoryEvent[] {
  const events: HistoryEvent[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^-\s+(\d{4}-\d{2}-\d{2}):\s*([^|]+)\|\s*([^|]+)\|\s*(.+)$/);
    if (!match) continue;
    events.push({ date: match[1], type: match[2].trim(), content: match[3].trim(), reason: match[4].trim() });
  }
  return events;
}

function clean(value: string): string {
  return value.replace(/\|/g, "／").replace(/\r?\n/g, " ").trim();
}

