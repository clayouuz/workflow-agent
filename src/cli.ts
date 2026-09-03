import {
  ledgerInit,
  ledgerShow,
  ledgerList,
  ledgerSetCurrent,
  ledgerEvent,
  ledgerAccept,
  ledgerStatus,
  ledgerCompile,
  ledgerTransition,
  ledgerTaskNew,
  ledgerTaskBind,
  ledgerTaskList,
  ledgerStepDone,
  ledgerStepSuspend,
  ledgerStepResume,
  ledgerNext,
  ledgerContext,
  ledgerLoad,
  ledgerLoads,
  ledgerMigrate,
  ledgerDelegation,
  ledgerProject,
  ledgerRepair,
} from "./commands/ledger.ts";
import {
  heuristicsShow,
  heuristicsLearn,
  heuristicsCheck,
  heuristicsDistill,
} from "./commands/heuristics.ts";
import { toolList, toolPropose, toolRequest } from "./commands/tool.ts";
import { testRun, testVerify, testManual, testConfig, testBuildGraph, testImpact } from "./commands/test.ts";
import { knowledgeAdd, knowledgeList, knowledgeRemove } from "./commands/knowledge.ts";
import { ledgerPackDisable, ledgerPackEnable, ledgerPackList } from "./commands/pack.ts";
import { logAppend, logTail } from "./commands/log.ts";
import { ledgerBenchmark } from "./commands/benchmark.ts";
import { ledgerWorkItem } from "./commands/work-item.ts";
import { ledgerDiscussion } from "./commands/discussion.ts";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const HELP = `workflow-agent — Agent 工作流骨架

用法: node src/cli.ts <模块> <命令> [参数]

模块:
  ledger      台账管理
  heuristics  启发策略
  knowledge   项目知识
  tool        工具扩展
  test        测试
  log         操作记录

常用命令:
  ledger init                     初始化工作区
  ledger migrate                  迁移旧工作区；restore <原路径> 可恢复归档
  ledger task new <名称>          新建并绑定任务
  ledger task bind <id>           绑定任务
  ledger task list                列出全部任务
  ledger delegation ...           委托讨论状态机（enable/discuss/confirm/permit/status）
  ledger discussion ...           复杂任务讨论状态机（init/discuss/confirm/permit/status）
  ledger benchmark ...            普通 Benchmark 验收状态机
  ledger work ...                 Work Item 实施状态机
  ledger project                  重建只读状态投影
  ledger repair                   从 Machine Event 修复状态和投影
  ledger pack list                列出当前任务的可选特化包
  ledger pack enable <pack>       为当前任务启用特化包
  ledger pack disable <pack>      为当前任务停用特化包
  ledger show                     查看任务入口
  ledger list                     列出全部 benchmark
  ledger next [Bid]               刷新并显示下一步
  ledger step done <Bid> <步骤id> 完成步骤并自动显示下一步
  ledger step suspend <Bid> <步骤id> <原因> [--resume-when <条件>]
  ledger step resume <Bid> <步骤id> [说明]
  ledger current <Bid> <步骤>     手动设置任务入口
  ledger event <Bid> <类型> <内容> [--reason <原因>]
  ledger transition ...           v8 已废弃；使用 benchmark/work 状态机
  ledger accept <Bid> [--override <原因>] 依据验证证据验收
  ledger status                   状态检查与自动提醒
  ledger context                  上下文规模报告
  ledger load <引用...>           输出并记录装配内容、字符数和 token 估算
  ledger loads                    查看加载记录
  ledger compile <Bid>            编译 benchmark 为快照
  heuristics show                 查看启发策略
  heuristics learn <记录>         追加学习记录
  heuristics check                查看策略/学习记录行数
  heuristics distill              校验蒸馏结果并归档学习记录
  knowledge add <段落> <内容>     加入知识索引（默认通过）
  knowledge list                  查看知识索引
  knowledge remove <段落> <关键词> 拒绝/移除条目
  tool list                       列出工具能力
  tool propose <名称> <场景>      提出新工具
  tool request <工具> <需求>      提出已有工具扩展
  test config <源码目录> [测试目录]  设置测试配置
  test build-graph                构建函数调用图
  test impact [变更文件...]       白盒影响测试
  test run [--bid <Bid>]          全量测试并可保存 benchmark 证据
  test manual <Bid> <Aid> pass|fail [备注] 记录人工验证
  test verify <Bid>               复核覆盖、人工结果和内容指纹
  log append <摘要> [选项]         追加一条任务级 Operation Log（--actor user|ai）
  log tail [数量] [选项]           读取当前任务最近的 Operation Log（可按 actor 筛选）

详见 docs/cli-commands.md
`;

const LOG_HELP = `workflow-agent Operation Log

用法:
  log append <摘要> [--actor user|ai] [--type <类型>] [--subject <对象>] [--reason <原因>] [--artifact <路径>]...
  log tail [数量] [--actor user|ai] [--type <类型>] [--subject <对象>]

说明:
  append  只追加一行 NDJSON；不读取旧日志、不刷新状态或上下文（actor 默认 ai）
  tail    默认返回最近 20 条，最大 200 条；可按 actor 筛选
`;

export async function runCli(args: string[] = process.argv.slice(2)): Promise<number> {
  if (args.length === 0 || ["--help", "-h", "help"].includes(args[0])) {
    console.log(HELP);
    return 0;
  }
  const [mod, cmd, ...rest] = args;
  try {
    switch (mod) {
      case "ledger":
        await dispatchLedger(cmd ?? "", rest);
        break;
      case "heuristics":
        await dispatchHeuristics(cmd ?? "", rest);
        break;
      case "knowledge":
        await dispatchKnowledge(cmd ?? "", rest);
        break;
      case "tool":
        await dispatchTool(cmd ?? "", rest);
        break;
      case "test":
        await dispatchTest(cmd ?? "", rest);
        break;
      case "log":
        await dispatchLog(cmd ?? "", rest);
        break;
      default:
        throw new Error(`未知模块: ${mod}\n\n${HELP}`);
    }
  } catch (err) {
    console.error(`错误: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  return 0;
}

async function main(): Promise<void> {
  const code = await runCli();
  if (code !== 0) process.exitCode = code;
}

async function dispatchLog(cmd: string, args: string[]): Promise<void> {
  if (["--help", "-h", "help"].includes(cmd)) {
    console.log(LOG_HELP);
    return;
  }
  switch (cmd) {
    case "append":
      return await logAppend(args);
    case "tail":
      return await logTail(args);
    default:
      throw new Error(`未知 log 命令: ${cmd || "(空)"}\n\n${LOG_HELP}`);
  }
}

async function dispatchLedger(cmd: string, args: string[]): Promise<void> {
  switch (cmd) {
    case "init":
      return await ledgerInit();
    case "migrate":
      return await ledgerMigrate(args);
    case "show":
      return await ledgerShow();
    case "list":
      return await ledgerList();
    case "current":
      return await ledgerSetCurrent(args);
    case "next":
      return await ledgerNext(args);
    case "step":
      return await dispatchLedgerStep(args);
    case "event":
      return await ledgerEvent(args);
    case "accept":
      return await ledgerAccept(args);
    case "transition":
      return await ledgerTransition(args);
    case "status":
      return await ledgerStatus();
    case "context":
      return await ledgerContext();
    case "load":
      return await ledgerLoad(args);
    case "loads":
      return await ledgerLoads();
    case "compile":
      return await ledgerCompile(args);
    case "task":
      return await dispatchLedgerTask(args);
    case "pack":
      return await dispatchLedgerPack(args);
    case "delegation":
      return await ledgerDelegation(args);
    case "discussion":
      return await ledgerDiscussion(args);
    case "benchmark":
      return await ledgerBenchmark(args);
    case "work":
      return await ledgerWorkItem(args);
    case "project":
      return await ledgerProject();
    case "repair":
      return await ledgerRepair();
    default:
      throw new Error(`未知 ledger 命令: ${cmd || "(空)"}\n可用: init migrate task pack delegation discussion show list next step current event transition accept status compile`);
  }
}

async function dispatchLedgerPack(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  switch (sub) {
    case "list":
      return await ledgerPackList();
    case "enable":
      return await ledgerPackEnable(rest);
    case "disable":
      return await ledgerPackDisable(rest);
    default:
      throw new Error(`未知 pack 命令: ${sub || "(空)"}\n可用: pack list | pack enable <pack> | pack disable <pack>`);
  }
}

async function dispatchLedgerTask(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  switch (sub) {
    case "new":
      return await ledgerTaskNew(rest);
    case "bind":
      return await ledgerTaskBind(rest);
    case "list":
      return await ledgerTaskList();
    default:
      throw new Error(`未知 task 命令: ${sub || "(空)"}\n可用: task new <名称> | task bind <id> | task list`);
  }
}

async function dispatchLedgerStep(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  switch (sub) {
    case "done":
      return await ledgerStepDone(rest);
    case "suspend":
      return await ledgerStepSuspend(rest);
    case "resume":
      return await ledgerStepResume(rest);
    default:
      throw new Error(`未知 step 命令: ${sub || "(空)"}\n可用: step done|suspend|resume`);
  }
}

async function dispatchHeuristics(cmd: string, args: string[]): Promise<void> {
  switch (cmd) {
    case "show":
      return await heuristicsShow();
    case "learn":
      return await heuristicsLearn(args);
    case "check":
      return await heuristicsCheck();
    case "distill":
      return await heuristicsDistill();
    default:
      throw new Error(`未知 heuristics 命令: ${cmd || "(空)"}\n可用: show learn check distill`);
  }
}

async function dispatchKnowledge(cmd: string, args: string[]): Promise<void> {
  switch (cmd) {
    case "add":
      return await knowledgeAdd(args);
    case "list":
      return await knowledgeList();
    case "remove":
      return await knowledgeRemove(args);
    default:
      throw new Error(`未知 knowledge 命令: ${cmd || "(空)"}\n可用: add list remove`);
  }
}

async function dispatchTool(cmd: string, args: string[]): Promise<void> {
  switch (cmd) {
    case "list":
      return await toolList();
    case "propose":
      return await toolPropose(args);
    case "request":
      return await toolRequest(args);
    default:
      throw new Error(`未知 tool 命令: ${cmd || "(空)"}\n可用: list propose request`);
  }
}

async function dispatchTest(cmd: string, args: string[]): Promise<void> {
  switch (cmd) {
    case "config":
      return await testConfig(args);
    case "build-graph":
      return await testBuildGraph();
    case "impact":
      return await testImpact(args);
    case "run":
      return await testRun(args);
    case "verify":
      return await testVerify(args);
    case "manual":
      return await testManual(args);
    default:
      throw new Error(`未知 test 命令: ${cmd || "(空)"}\n可用: config build-graph impact run manual verify`);
  }
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) await main();
