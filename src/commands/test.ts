import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { exists } from "../core/fs.ts";
import { PATHS } from "../core/workspace.ts";
import { readConfig, writeConfig, DEFAULT_CONFIG } from "../core/test-config.ts";
import type { TestConfig } from "../core/test-config.ts";
import { discoverTestFiles, runFiles } from "../core/test-runner.ts";
import { buildGraph, impactedTestFiles } from "../core/callgraph.ts";
import { fingerprintTestInputs } from "../core/hash.ts";
import { expandUserPath } from "../core/paths.ts";
import {
  buildAutomaticAcceptance,
  createVerificationRecord,
  evaluateVerification,
  readBenchmark,
  readVerificationRecord,
  writeVerificationRecord,
} from "../core/verification.ts";

export async function testConfig(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log(JSON.stringify(await readConfig(), null, 2));
    return;
  }
  const [sourceRoot, testRoot] = args;
  const config: TestConfig = {
    sourceRoots: [resolve(expandUserPath(sourceRoot))],
    testRoots: testRoot ? [resolve(expandUserPath(testRoot))] : [PATHS.tests],
    exclude: DEFAULT_CONFIG.exclude,
  };
  await writeConfig(config);
  console.log("测试配置已写入 workspace/tests/config.json");
  console.log(JSON.stringify(config, null, 2));
}

export async function testBuildGraph(): Promise<void> {
  const config = await readConfig();
  if (config.sourceRoots.length === 0) throw new Error("sourceRoots 为空，请先执行 test config <源码目录>");
  const graph = await buildGraph(config);
  console.log(`调用图已生成: ${graph.functions.length} 个函数, ${graph.calls.length} 条调用边`);
  console.log("缓存位置: workspace/tests/callgraph.json");
}

function gitChangedFiles(cwd: string): string[] {
  try {
    const out = execSync("git diff --name-only HEAD", { cwd, encoding: "utf8" });
    return out.split(/\r?\n/).filter(Boolean).map((file) => resolve(cwd, file));
  } catch {
    return [];
  }
}

export async function testImpact(args: string[]): Promise<void> {
  const config = await readConfig();
  if (config.sourceRoots.length === 0) throw new Error("sourceRoots 为空，请先执行 test config <源码目录>");
  let changedFiles = args.map((file) => resolve(file));
  if (changedFiles.length === 0) {
    changedFiles = gitChangedFiles(process.cwd());
    if (changedFiles.length === 0) {
      throw new Error("未提供变更文件，且 git diff 无结果。\n用法: test impact <变更文件1> [变更文件2...]");
    }
    console.log(`从 git diff 检测到 ${changedFiles.length} 个变更文件。`);
  }

  const impacted = await impactedTestFiles(config, changedFiles);
  if (impacted.length === 0) {
    console.log("没有测试文件覆盖这些修改（验证状态应视为 incomplete）。");
    console.log("修改文件: " + changedFiles.join(", "));
    process.exitCode = 1;
    return;
  }

  console.log(`受影响测试文件 ${impacted.length} 个，开始运行...\n`);
  const result = await runFiles(impacted);
  console.log(`\n影响测试: ${result.total} 个用例, 通过 ${result.passed}, 失败 ${result.failed}`);
  process.exitCode = result.failed > 0 || result.total === 0 ? 1 : 0;
}

export async function testRun(args: string[] = []): Promise<void> {
  if (!(await exists(PATHS.tests))) {
    throw new Error("未找到 workspace/tests 目录，请先执行 ledger init。");
  }
  const bid = optionValue(args, "--bid");
  if (args.length > 0 && !bid) throw new Error("用法: test run [--bid <Bid>]");
  const config = await readConfig();
  const roots = new Set<string>([PATHS.tests, ...config.testRoots.map((root) => resolve(root))]);
  const files: string[] = [];
  for (const root of roots) {
    for (const file of await discoverTestFiles(root)) if (!files.includes(file)) files.push(file);
  }

  let record = bid ? (await readVerificationRecord(bid) ?? createVerificationRecord(bid)) : null;
  if (record) {
    record.status = "incomplete";
    record.automatic.run = null;
    record.automatic.acceptance = {};
    await writeVerificationRecord(record);
  }

  if (files.length === 0) {
    console.log("未发现 *.test.ts 测试文件，结果为 incomplete。");
    process.exitCode = 1;
    return;
  }

  console.log(`全量测试: ${files.length} 个测试文件\n`);
  const result = await runFiles(files);
  console.log(`\n全量测试: ${result.total} 个用例, 通过 ${result.passed}, 失败 ${result.failed}`);

  if (bid && record) {
    const bench = await readBenchmark(bid);
    record.automatic.run = result;
    record.automatic.acceptance = buildAutomaticAcceptance(bench, result);
    record.fingerprint = await fingerprintTestInputs(config);
    await evaluateVerification(record, bench);
    await writeVerificationRecord(record);
    console.log(`验证证据: ${bid} ${record.status}`);
  }
  process.exitCode = result.failed > 0 || result.total === 0 ? 1 : 0;
}

export async function testManual(args: string[]): Promise<void> {
  const [bid, aid, result, ...noteParts] = args;
  if (!bid || !aid || !result || !["pass", "fail"].includes(result)) {
    throw new Error("用法: test manual <Bid> <Aid> <pass|fail> [备注]");
  }
  const bench = await readBenchmark(bid);
  const acceptance = bench.acceptanceItems.find((item) => item.id.toLowerCase() === aid.toLowerCase());
  if (!acceptance) throw new Error(`找不到验收项: ${aid}`);
  if (acceptance.mode !== "manual") throw new Error(`${aid} 不是 manual 验收项`);
  const record = await readVerificationRecord(bid) ?? createVerificationRecord(bid);
  record.manual[acceptance.id] = {
    result: result as "pass" | "fail",
    note: noteParts.join(" "),
    recordedAt: new Date().toISOString(),
  };
  await evaluateVerification(record, bench);
  await writeVerificationRecord(record);
  console.log(`人工验证已记录: ${acceptance.id} ${result}；当前状态 ${record.status}`);
}

export async function testVerify(args: string[]): Promise<void> {
  const [bid] = args;
  if (!bid) throw new Error("用法: test verify <Bid>");
  const bench = await readBenchmark(bid);
  const record = await readVerificationRecord(bid);
  if (!record) throw new Error(`${bid} 缺少验证证据，状态 incomplete`);
  await evaluateVerification(record, bench);
  await writeVerificationRecord(record);
  console.log(`验证状态: ${bid} ${record.status}`);
  for (const item of bench.acceptanceItems) {
    const passed = item.mode === "auto"
      ? record.automatic.acceptance[item.id]?.passed === true
      : record.manual[item.id]?.result === "pass";
    console.log(`  ${item.id} [${item.mode}] ${passed ? "通过" : "未通过"}`);
  }
  if (record.status !== "valid") throw new Error(`${bid} 验证状态为 ${record.status}`);
}

function optionValue(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  return index >= 0 ? args[index + 1] : undefined;
}
