# 权威说明

## 目标
修改 Codex 全局 `AGENTS.md`，让 Agent 先将用户提到的任务与已有台账任务做语义匹配；命中后主动绑定并加载该任务上下文，不把用户手动绑定任务当作触发条件。

## 范围
- 修改 `C:\Users\zhaoyan\.codex\AGENTS.md`。
- 保留现有开发阶段与确认规则。
- 明确已有任务匹配、绑定、上下文加载、新建和提问边界。

## 非目标
- 不修改 workflow-agent 源码、模板或 CLI。
- 不为一次性普通问答创建台账。
- 不通过关键词机械判断任务归属。

## 已确认要求
- 任务台账、测试和工具扩展继续按 `C:\Users\zhaoyan\workflow-agent\SKILL.md` 执行。
- `ledger task bind` 只负责选择既有任务，不作为 workflow 的触发条件。
- 命中已有任务后执行 `ledger task bind <id>`，随后执行 `ledger load` 装配该任务上下文。
- 没有命中已有任务时才创建新任务。

## 必须遵守的约束
- 代码设计确认前不修改全局 `AGENTS.md`。
- 全局指令保持精简，不重复 `SKILL.md` 的完整操作流程。
