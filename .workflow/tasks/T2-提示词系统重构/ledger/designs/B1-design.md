# B1 核心台账与工作状态设计

## 预期结果
Step 可挂起和恢复，current 提供可重建的会话入口，历史与快照路径可追溯且确定。

## 修改设计
- `core/benchmarks.ts` 解析 benchmark、验收项和 step 状态，并提供纯函数更新。
- `core/current.ts` 解析与渲染会话入口，挂起摘要最多展示三项。
- `core/history.ts` 统一事件格式。
- `commands/ledger.ts` 编排 suspend/resume/done/next/compile，不判断 step 之间的语义依赖。

## 黑盒约定
- 挂起 step 被 next 跳过，且不能直接完成。
- current 显示挂起原因和恢复条件的精简摘要。
- 历史使用“日期: 类型 | 内容 | 原因”。
- 多次编译生成连续版本，快照引用真实归档路径。

## 白盒关注点
- 挂起摘要超过三项时不丢失总数。
- 快照草稿校验失败时不移动历史。
- 最终快照写入失败时恢复已移动的历史。

## 注释要求
只在 current 投影的非真相源边界和 compile 的回滚边界处保留原因注释。
