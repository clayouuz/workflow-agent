# 上下文装配规则

说明：ledger 指当前绑定任务的台账目录（.workflow/tasks/<active>/ledger/）。discussion、heuristics、tools、tests 为项目级共享。

## 热层（每次会话必加载，≤1页）
1. ledger/current.md（任务入口）
2. heuristics/strategy.md（启发策略）
3. ledger/authority.md 的"当前有效结论"段
4. knowledge/index.md（项目知识索引）

## 温层（按需加载，涉及才读，≤2页）
1. ledger/benchmarks.md 中涉及到的 benchmark 条目
2. 对应 snapshot 文件（若无 snapshot 则读 history/<Bid>.md 最近 5 条）
3. discussion/workflow.md（阶段切换时）
4. discussion/rules.md（设计/工具决策时）

## 冷层（默认不加载）
1. ledger/history/ 全部事件
2. ledger/raw/ 原始材料
3. ledger/audit.md 历史记录
4. heuristics/learnings.md（仅蒸馏时加载）

## 预算（硬上限，先用后改）
- current.md ≤ 30 行
- authority.md 的"当前有效结论"段 ≤ 60 行
- strategy.md ≤ 50 行
- 温层超过 2 页 → 按需裁剪，只保留当前决策相关内容
