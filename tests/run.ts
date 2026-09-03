import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverTestFiles, runFiles } from "../src/core/test-runner.ts";
import { closeTestWorkspaceWorkers } from "./helpers/cli.ts";

const testsRoot = dirname(fileURLToPath(import.meta.url));
const files = (await discoverTestFiles(testsRoot)).sort();
let result;
try {
  result = await runFiles(files);
} finally {
  await closeTestWorkspaceWorkers();
}
console.log(`\nSelf tests: ${result.total} cases, ${result.failed} failed`);
process.exitCode = result.failed > 0 ? 1 : 0;
