# 上下文装配

目标是为当前决策提供精确且足够的上下文，不追求加载完整历史。

## 基础入口
每次会话先读取：
- 当前任务 `ledger/current.md`
- 当前任务 `ledger/authority.md`
- `knowledge/index.md`
- `discussion/operation-log.md`（LLM 判断何时记录有复盘价值的操作）

再按 `current.md` 的“继续工作时加载”读取当前 benchmark、设计文档和相关快照。引用可以使用 `文件#标题`，只提取对应 Markdown 段落。

## 按需内容
- 讨论或代码设计需要主动启发时读取 `heuristics/strategy.md`。
- 阶段切换、项目修改或验收时读取 `discussion/workflow.md`。
- 讨论中按 workflow 的 Pack 规则显式读取相关指南或模板章节；启用包不会自动装配其文件。恢复时优先读取当前设计，仅补充当前讨论需要的 Pack 材料。
- `operations/`、`history/`、`raw/`、`audit.md`、`loads.md` 默认不加载；只有恢复、诊断或复盘需要时才显式读取。

## 估算参考
- 常态参考：6k–10k tokens
- 警戒参考：15k tokens
- 极限参考：25k tokens

估算只用于发现误加载、重复内容和可由快照替代的历史；不自动压缩，也不拒绝继续加载。
