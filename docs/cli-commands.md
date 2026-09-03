# CLI 命令说明

工作区默认是当前目录下的 `.workflow`，也可用 `WORKFLOW_WORKSPACE` 指向其他位置。

```text
node ~/workflow-agent/src/cli.ts <模块> <命令> [参数]
```

全局帮助：

```text
node src/cli.ts --help
node src/cli.ts -h
node src/cli.ts help
```

## ledger

| 命令 | 作用 |
|---|---|
| `ledger init` | 初始化新工作区或补齐当前版本缺失文件；不会覆盖已有文件 |
| `ledger migrate` | 将无清单或旧版本工作区迁移到当前结构 |
| `ledger migrate restore <原路径>` | 按 `schema.json` 从迁移归档恢复文件，不覆盖现有目标 |
| `ledger task new <名称>` | 新建、编号并绑定任务 |
| `ledger task bind <id>` | 绑定当前任务 |
| `ledger task list` | 列出任务，`*` 表示当前绑定 |
| `ledger pack list` | 列出可用特化包及其在当前任务的启用状态 |
| `ledger pack enable <pack>` | 为当前任务显式启用特化包；重复执行幂等，不自动加入上下文 |
| `ledger pack disable <pack>` | 停用当前任务的特化包；不会删除已自定义的 pack 文件 |
| `ledger delegation enable <边界确认依据>` | 在 authority 已记录委托后启用任务级讨论状态机 |
| `ledger delegation discuss solution\|code\|combined <设计文件>` | 记录已向用户展示的设计文件及内容哈希 |
| `ledger delegation confirm solution\|code\|combined <用户确认原文>` | 记录针对当前设计哈希的用户明确确认 |
| `ledger delegation permit` | 完整确认链及设计哈希有效时授予实现许可 |
| `ledger delegation status` | 查看当前委托状态和边界确认依据 |
| `ledger discussion init <复杂度判断依据>` | 为复杂任务启用讨论状态机 |
| `ledger discussion discuss target\|plan\|acceptance\|combined <设计文件>` | 记录目标、方案或验收方式讨论 |
| `ledger discussion confirm target\|plan\|acceptance\|combined <用户确认原文>` | 记录对应用户确认 |
| `ledger discussion permit` | 三项确认有效时授予执行许可 |
| `ledger discussion status` | 查看当前讨论阶段 |
| `ledger benchmark register/status/ready/verify/request-review/accept/accept-risk/block/resume/reopen/obsolete ...` | 管理普通 Benchmark 验收状态机 |
| `ledger work register/status/start/done/block/resume/reopen/obsolete ...` | 管理 Work Item 实施状态机 |
| `ledger project` | 从语义文档和机器状态刷新只读投影 |
| `ledger repair` | 从 append-only Machine Event 重建状态和投影 |
| `ledger show` | 输出当前任务 `current.md` |
| `ledger list` | 列出 benchmark 状态、验收和 step 进度 |
| `ledger next [Bid]` | 投影并显示下一个未完成且未挂起的 step |
| `ledger step done <Bid> <StepId>` | 完成 step 并刷新下一步 |
| `ledger step suspend <Bid> <StepId> <原因> [--resume-when <条件>]` | 局部挂起 step |
| `ledger step resume <Bid> <StepId> [说明]` | 恢复挂起 step |
| `ledger current <Bid> <步骤>` | 手动设置当前入口 |
| `ledger event <Bid> <类型> <内容> [--reason <原因>]` | 追加 `日期: 类型 \| 内容 \| 原因` 事件 |
| `ledger transition ...` | v8 已废弃；不能绕过状态机自由修改状态 |
| `ledger accept <Bid>` | 只在验证证据为 `valid` 时验收并勾选验收项 |
| `ledger accept <Bid> --override <原因>` | 显式接受缺失验证或风险；记录原因但不伪造验收项勾选 |
| `ledger status` | 检查未编译 benchmark、上下文估算和学习记录提醒 |
| `ledger context` | 预览当前引用的字符数和 token 估算 |
| `ledger load [引用...]` | 输出装配内容并记录字符数、token 估算；无参数时使用 `current.md` 引用 |
| `ledger loads` | 查看上下文加载记录 |
| `ledger compile <Bid>` | 校验 `<Bid>-draft.json`，生成快照并以 `<Bid>-vNNN.md` 归档事件 |

引用中的 `ledger/` 指当前任务台账，其余路径相对 `.workflow`。Markdown 可写成 `ledger/benchmarks.md#B3`，只加载匹配标题段落。

审批委托先讨论自动审批范围、不可自动审批事项、用户验收和重新讨论条件。边界确认后更新 authority 和规则引用，再用 `delegation enable` 建立状态机。完整设计路径依次记录 solution 和 code 的讨论与确认；简单任务使用 combined。设计内容变化会使旧确认失效。未委托任务不创建状态文件或加载委托规则；审批委托不能替代 `test manual` 证据或风险确认。

特化包由 Agent 根据已明确的任务需要启用，CLI 不扫描关键词或猜测项目类型。当前内置 pack 为 `cocos`。

## test

| 命令 | 作用 |
|---|---|
| `test config [源码目录] [测试目录]` | 无参数时查看配置；有参数时写入源码和测试根 |
| `test build-graph` | 构建 TypeScript 函数调用图 |
| `test impact <变更文件...>` | 运行调用图可关联的受影响测试；无覆盖时返回失败 |
| `test run [--bid <Bid>]` | 运行全部 `*.test.ts` 中的 `test_*`；可保存验收项级证据和内容指纹 |
| `test manual <Bid> <Aid> <pass\|fail> [备注]` | 记录人工验收结果 |
| `test verify <Bid>` | 重算指纹并报告 `valid/failed/stale/incomplete` |

测试函数名用验收项 ID 的下划线形式建立覆盖，例如 `test_B3_A2_manual_flow` 覆盖 `B3-A2`。匹配完整 ID，不会用 `B3-A1` 覆盖 `B3-A10`。

## log

Operation Log 由 LLM 根据热层规则主动记录，不自动拦截其他 CLI 命令。用户主动输入使用 `--actor user`，Agent 记录使用 `--actor ai`；实际记录属于任务冷层，默认不进入 `ledger load`。

| 命令 | 作用 |
|---|---|
| `log append <摘要> [--actor user\|ai] [--type <类型>] [--subject <对象>] [--reason <原因>] [--artifact <路径>]...` | 向当前任务当月 NDJSON 追加一条记录 |
| `log tail [数量] [--actor user\|ai] [--type <类型>] [--subject <对象>]` | 显式读取最近记录；默认 20，最大 200 |
| `log --help` | 查看日志命令帮助 |

Artifact 只保存引用，不读取、复制或哈希目标文件。不要记录密钥、令牌、敏感环境变量和完整终端输出。

## knowledge

| 命令 | 作用 |
|---|---|
| `knowledge add <段落> <内容>` | 添加精简、跨任务事实；段落为 `路径与资源/文档入口/项目约定` |
| `knowledge list` | 输出知识索引 |
| `knowledge remove <段落> <关键词>` | 删除用户不认可或已失效的条目 |

条目本身不保存来源和日期；变更追溯写入 `knowledge/audit.md`。

## heuristics

| 命令 | 作用 |
|---|---|
| `heuristics show` | 查看非强制启发策略 |
| `heuristics learn <记录>` | 记录一次“用户明确指出本应主动提醒”的遗漏 |
| `heuristics check` | 查看策略规模和学习条目数量 |
| `heuristics distill` | 将学习记录按连续版本归档，保留已确认的策略 |

## tool

| 命令 | 作用 |
|---|---|
| `tool list` | 查看已登记的确定性工具能力 |
| `tool propose <名称> <场景>` | 提议把易错机械流程固化为新工具 |
| `tool request <工具> <需求>` | 请求扩展已有工具能力 |

所有命令成功返回 `0`；参数错误、验证失败、测试失败或没有影响测试覆盖时返回非零状态。
