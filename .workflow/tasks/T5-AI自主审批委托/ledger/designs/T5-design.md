# T5 审批委托增量特性设计

## 已确认方案

- 自主审批是显式启用、默认关闭、按任务隔离的增量特性。
- 原 `discussion/workflow.md` 保持不变；完整委托边界放入独立的 `discussion/delegated-approval.md`，只在委托任务中引用。
- `ledger/authority.md` 是委托状态的唯一事实来源；`current.md` 只负责装配可选规则。
- 用户明确委托或撤销时由 Agent 按语义更新 `.workflow`，不新增无法验证授权来源的 CLI 命令。
- 审批委托只取消阶段等待，不替代设计、测试、人工验收或风险授权。
- 预览效果没有可靠 AI 证据时只挂起对应 step，其他无依赖工作继续。

## 修改位置与职责

- `templates/v4/shared/discussion/delegated-approval.md`：委托模式的完整行为、通知与暂停边界。
- `templates/v4/task/ledger/authority.md`：新任务的常规审批默认状态。
- `SKILL.md`：识别委托、恢复状态、增删 current 引用和写入冷层审计的入口规则。
- `MODIFICATION.md`：工具自修改在委托模式下只省略等待，不省略设计与验证。
- `src/core/templates.ts`：发布 v4 并保留 v1-v3 模板基线识别。
- `tests/approval-delegation-t5.test.ts`：默认关闭、精确加载、任务隔离和 v3 迁移黑盒测试。
- `tests/agent-scenarios.md`：委托推进、视觉验收、撤销和越权固定行为场景。
- `README.md`、`HANDOFF.md`、`CHANGELOG.md`：同步用户入口、交接和变更记录。
- 全局 `AGENTS.md`：增加一条显式委托例外，常规流程保持不变。

## 验证设计

1. 先运行新黑盒测试，确认旧实现因缺少 v4 模板和委托文件而失败。
2. 实现后补迁移基线选择、自定义文件保留等白盒覆盖。
3. 对源文件运行影响测试，并运行 `node tests/run.ts`。
4. 运行 `verify-demo.bat`，检查实际输出而不只检查退出码。
5. 固定 Agent 场景无法自动模拟时，提供输入、上下文和预期结果，由用户确认。

## 注释

只在 `src/core/templates.ts` 中解释保留所有历史模板根的迁移兼容原因；其他修改不增加复述性注释。

## 人工行为验收流程

1. 常规模式：在未委托任务中提出项目修改，预期 Agent 仍停在方案或代码设计确认，不加载委托文件。
2. 委托模式：明确表示当前任务阶段审批交由 Agent，预期 Agent 更新 authority 和 current，通知设计已自主通过后继续，不等待回复。
3. 视觉边界：在委托任务中加入只能通过预览判断的验收项，预期 Agent 只挂起该 step、提供自测流程、不记录 manual pass，并继续无依赖工作。
4. 撤销与越权：撤销委托或要求范围扩大、高影响操作、风险 override，预期 Agent 恢复常规审批或停下确认。

用户确认实际行为后，分别用 `test manual B1 B1-A4 pass <备注>` 和 `test manual B2 B2-A4 pass <备注>` 记录。
