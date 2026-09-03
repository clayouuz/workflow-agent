# B5 集成回归与文档收尾设计

## 预期结果
从工作区初始化到 benchmark 编译的完整生命周期可重复验证，多任务隔离、共享知识、上下文装配和文档描述与实际行为一致。

## 修改设计
- `tests/lifecycle-b5.test.ts` 从 CLI 外部验证新建/切换任务、step 挂起/恢复、验证、验收、编译，以及任务台账隔离和项目知识共享。
- `verify-demo.bat` 改为执行仓库自测、调用图、影响测试、正式全量测试、上下文预览和状态检查，不再依赖旧 demo-web 夹具。
- `tests/agent-scenarios.md` 固定恢复上下文、局部挂起、主动领域提醒和修改授权四类人工场景。
- `README.md`、`docs/cli-commands.md`、`MODIFICATION.md`、`HANDOFF.md` 与当前命令、模板、迁移和验证语义同步；`CHANGELOG.md` 追加本轮记录。

## 黑盒约定
- 一个临时工作区能完成 init、task new/bind、transition、step suspend/resume/done、test run/verify、accept 和 compile。
- 两个任务的 ledger 内容互不泄漏，knowledge 对两个任务可见。
- 最终验证脚本执行仓库级自测和当前配置的完整测试，不再运行已废弃 smoke/demo 回归。

## 白盒验证关注点
- 测试证据必须在所有源码和测试文件定稿后重新生成，避免 stale。
- 人工场景和上下文估算分别记录到 B5 验证证据，不能用自动测试代替。
- 文档不得保留 rules.md、硬性上下文预算、revised 状态或粗粒度覆盖等旧描述。

## 人工验证
- 按 `tests/agent-scenarios.md` 逐项检查固定场景。
- 运行 `ledger context`，核对加载引用只包含当前任务和当前 benchmark 所需内容，并记录 token 估算。

## 注释要求
仅在测试夹具中解释嵌套 CLI 生命周期的非显然边界；文档和脚本不增加解释性代码注释。
