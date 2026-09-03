# Workflow Agent

workflow-agent 用 `.workflow` 保存可恢复的任务上下文。LLM 负责语义判断；CLI 负责确定性状态、验证、事件和投影。

## 开始或恢复

1. 必要时运行 `ledger init` 或 `ledger migrate`。
2. 使用 `ledger task list/bind/new` 确认当前任务。
3. 运行 `ledger status` 和 `ledger load`，按装配出的当前状态和下一步继续。

LLM 判断任务复杂时，使用 `ledger discussion` 状态机，依次明确目标、具体方案和验收方式；简单任务不创建讨论状态。

## 写入边界

- Authority、Benchmark Contract、Design、Work Item 和 Raw 是语义文档，LLM 可以直接编辑。
- State、Verification、Machine Event、Current、Benchmark Index、Audit 和编译后 Snapshot 是机器数据或投影，只能经 CLI 修改。
- Operation Log 只能通过 `log append` 追加；Knowledge 使用 `knowledge add/remove` 管理。

## 按需规则

- 阶段切换或修改项目时读取 `discussion/workflow.md`。
- 委托任务读取 `discussion/delegated-approval.md`。
- 特定领域按需启用 Pack；完整命令使用 `--help`。
- 修改 workflow-agent 自身时读取 `MODIFICATION.md`。
- 用户主动提出、确认、纠正或要求变更的内容默认记录到 Operation Log（`--actor user`）；Agent 结论使用 `--actor ai`；普通查询、机械编辑、重复命令和完整终端输出可跳过。

## 验证边界

未执行、失败、过期或缺少人工证据时，不得声称通过。根据状态机和 CLI 输出完成验证、验收、归档和投影。

CLI：`node ~/workflow-agent/src/cli.ts <模块> <命令> [参数]`
