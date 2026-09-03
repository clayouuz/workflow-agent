import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderAgentPage } from "./renderer.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "output");
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "agent-status.html");
writeFileSync(outFile, renderAgentPage(), "utf8");
console.log(`已生成: ${outFile}`);
