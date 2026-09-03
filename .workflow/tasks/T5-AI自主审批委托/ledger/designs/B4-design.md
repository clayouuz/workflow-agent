# B4 委托讨论状态机代码设计

## 已确认方案

- 委托只改变设计质量的审查责任，不取消用户参与设计讨论和明确确认的节点。
- 委托任务必须通过确定性状态机记录边界讨论、方案讨论、代码设计讨论及对应用户确认，才能取得实现许可。
- 简单任务允许合并方案与代码设计，但仍须展示并取得一次明确确认。
- 普通任务不创建委托状态文件、不加载委托规则，保持现有流程。

## 修改位置与职责

- `src/core/delegation.ts`：保存任务级委托状态、设计哈希、用户确认原文和合法迁移守卫。
- `src/commands/ledger.ts`、`src/cli.ts`：提供 delegation enable/discuss/confirm/permit/status 命令并写审计事件。
- `templates/v6/shared/discussion/delegated-approval.md`：把自主通过改为强制讨论和用户明确确认。
- `SKILL.md`、`MODIFICATION.md`：实现前必须取得状态机许可；Agent 自审不能代替用户确认。
- `src/core/templates.ts`、`src/core/migration.ts`：发布 v6，并使既有委托任务迁移到安全的边界已确认状态；普通任务不生成状态文件。
- `tests/approval-delegation-t5.test.ts`：覆盖合法路径、非法跳跃、缺少确认、设计变更失效、合并设计和迁移隔离。
- `tests/agent-scenarios.md`：固定展示设计后等待用户确认的行为。
- README、HANDOFF、CLI 文档、CHANGELOG：同步入口和兼容说明。

## 状态与证据

- 完整路径：`boundary_confirmed -> solution_discussed -> solution_confirmed -> code_design_discussed -> code_design_confirmed -> implementation_permitted`。
- 合并路径：`boundary_confirmed -> combined_design_discussed -> combined_design_confirmed -> implementation_permitted`。
- discussed 状态保存设计文件引用和内容哈希；confirm 保存用户确认原文及对应哈希；permit 重新计算哈希，变化时拒绝许可。
- CLI 只能验证确认记录、状态顺序和设计一致性，不能独立证明确认文字来自真实对话；不得将记录宣称为密码学来源证明。

## 验证

1. 先添加并运行旧实现下失败的黑盒测试。
2. 实现后运行相关测试、`test impact` 和 `node tests/run.ts`。
3. 最终运行 `verify-demo.bat` 并检查实际输出。
4. Agent 行为仍需人工场景确认，不自动填写 manual pass。

## 注释

只注释 v6 迁移为何不继承旧自主批准，以及设计哈希为何在 permit 时重新校验。
