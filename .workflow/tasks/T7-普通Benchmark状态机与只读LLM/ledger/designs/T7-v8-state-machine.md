# T7 v8 普通 Benchmark 状态机设计

## 已确认方案

- 语义文档可直接编辑；机器状态、验证、事件和投影由 CLI 独占。
- Benchmark Contract 与 Work Item 文档独立，项目结构放在 Design。
- Benchmark 生命周期为 `draft → ready → verifying → awaiting_manual_review → accepted`，支持 blocked hold、reopened、obsolete 和 accepted_with_risk。
- Work Item 生命周期为 `pending → active → done`，支持 blocked hold、reopen 和 obsolete。
- Machine Event 是状态事实的 append-only 权威；State JSON 和 Markdown 投影可以重建。
- 语义文档指纹发生变化时，读命令报告 drift，状态变化命令拒绝继续，必须显式 reopen/ready。

## 代码设计

- 新增 machine-events、semantic-documents、benchmark-machine、work-item-machine 和 projections Core。
- 新增 benchmark/work-item Commands，从 ledger.ts 拆出状态编排。
- 新增 `ledger benchmark ...`、`ledger work ...`、`ledger project/repair`；废弃自由 `ledger transition` 和旧 step 状态命令。
- v8 使用 `ledger/benchmarks/<Bid>.md`、`ledger/work-items/<Wid>.md`、`ledger/state/`、`ledger/machine-events/`；`current.md`、`benchmarks.md`、`audit.md` 为只读投影。
- Verification 绑定 Contract Digest 和相关 Work Item Digest；证据缺失、失败、过期或人工待办时不能 accepted。
- v7→v8 迁移拆分旧 Benchmark/Step；只有 valid Verification 的旧 done 才迁移为 accepted。

## SKILL 下放

- SKILL 只保留工具定位、最小启动、语义/机器写入边界、按需路由和验证诚信。
- 上下文、日志、委托、工具自修改和命令语法分别由 discussion 文件、MODIFICATION 和 `--help` 管理。

## 验证

- 覆盖全部合法/非法迁移、blocked 恢复、内容 drift、证据门禁、事件重放、投影重建、任务隔离和 v7→v8 迁移。
- 运行影响测试、全量测试和 verify-demo。
