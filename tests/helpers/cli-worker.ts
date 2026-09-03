import { createInterface } from "node:readline";
import { runCli } from "../../src/cli.ts";

interface Request { id: number; args: string[] }

const originalLog = console.log;
const originalError = console.error;
const originalWrite = process.stdout.write.bind(process.stdout);
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of input) {
  if (!line.trim()) continue;
  let request: Request;
  try { request = JSON.parse(line) as Request; }
  catch { originalWrite(JSON.stringify({ id: -1, code: 1, output: "worker 请求不是合法 JSON\n" }) + "\n"); continue; }

  let output = "";
  console.log = (...args: unknown[]) => { output += `${args.map(String).join(" ")}\n`; };
  console.error = (...args: unknown[]) => { output += `${args.map(String).join(" ")}\n`; };
  process.stdout.write = ((chunk: string | Uint8Array) => { output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(); return true; }) as typeof process.stdout.write;
  process.exitCode = 0;
  let code = 1;
  try {
    code = await runCli(request.args);
    if (process.exitCode && process.exitCode !== 0) code = process.exitCode;
  } catch (error) {
    output += `错误: ${error instanceof Error ? error.message : String(error)}\n`;
  }
  console.log = originalLog;
  console.error = originalError;
  process.stdout.write = originalWrite;
  process.exitCode = 0;
  originalWrite(`${JSON.stringify({ id: request.id, code, output })}\n`);
}
