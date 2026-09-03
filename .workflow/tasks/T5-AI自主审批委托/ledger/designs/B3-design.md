# B3 委托边界检查点设计

## 已确认方案

- 委托启用前讨论当前任务的自动审批范围、不可自动审批事项、用户验收和重新讨论条件。
- 笼统委托先展示边界并等待一次确认；用户已经明确给出范围和排除事项时，复述后直接启用。
- 确认前不把 authority 标为已委托，也不加载可选委托规则。
- 后续只重新讨论发生实质变化的边界，其他授权继续有效。
- 通用检查方向按任务实际情况裁剪；常规任务不加载完整委托规则。

## 修改位置与职责

- `templates/v5/shared/discussion/delegated-approval.md`：增加启用前边界讨论和任务特定裁剪规则。
- `templates/v5/task/ledger/authority.md`：保持常规审批默认内容不变。
- `SKILL.md`：定义笼统委托、明确委托、边界确认和引用装配顺序。
- `MODIFICATION.md`：自修改委托同样先明确不可自动审批边界。
- 全局 `AGENTS.md`：增加一条简短的委托边界入口。
- `src/core/templates.ts`：发布 v5 并加入 v4 历史模板基线。
- `tests/approval-delegation-t5.test.ts`：覆盖边界规则、默认关闭和 v4 迁移。
- `tests/agent-scenarios.md`：覆盖笼统委托、明确委托和局部重议。
- README、HANDOFF、CLI 文档和 CHANGELOG：同步行为说明。

## 验证

1. 新测试先在 v4 实现上失败。
2. 实现后运行 `test impact src/core/templates.ts` 和 `node tests/run.ts`。
3. 运行 `verify-demo.bat` 并检查输出。
4. 固定 Agent 行为由用户实际确认，不能自动伪造 manual pass。

## 注释

复用 `templates.ts` 已有的历史基线兼容注释，不新增复述性注释。

## 人工行为验收流程

1. 笼统委托：只说“这个任务交给你自主审批”，预期 Agent 先提出任务特定边界，确认前不标记已委托。
2. 明确委托：同时说明授权范围和排除事项，预期 Agent 复述后直接启用，不重复等待确认。
3. 局部重议：已委托任务新增一个原边界之外的高影响步骤，预期只讨论新增边界，其他授权继续有效。
4. 常规任务：没有表达委托，预期继续使用原审批流程且不加载委托规则。

用户确认实际行为后，用 `test manual B3 B3-A4 pass <备注>` 记录结果。
