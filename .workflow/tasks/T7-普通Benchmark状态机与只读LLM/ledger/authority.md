# 权威说明

## 目标
将普通 Benchmark 和 Work Item 纳入确定性状态机，分离可编辑语义文档、CLI 独占机器状态和只读生成投影，防止自由状态修改或直接编辑投影绕过验证门禁。

## 范围
- 普通 Benchmark 与 Work Item 状态机、合法迁移和内容指纹。
- Machine Event append-only 权威日志与状态/投影重建。
- Benchmark Contract、Work Item、Design、Authority 等语义文档允许 LLM 直接编辑。
- State、Verification、Machine Event、Current、Benchmark Index、Audit 等只允许 CLI 修改。
- v7→v8 安全迁移、兼容提示、测试和文档。
- 精简 SKILL.md，把上下文、日志、委托和命令细节下放到按需文件与 CLI help。

## 非目标
- 本任务不统一普通任务与委托任务的方案审批状态机。
- 不开发 game Pack、表现测试 Provider 或删除 game-implementation Skill。
- 不使用操作系统权限阻止文件修改；只通过架构边界、CLI 和验证约束 Agent 行为。

## 已确认要求
- 普通 Benchmark 必须由状态机管理，不能自由 transition 到完成。
- LLM 可以直接编辑语义文档，但不能直接编辑机器状态、验证、事件和投影。
- 语义文档变化通过内容指纹使旧确认、完成或验证失效。
- Benchmark 只描述独立验收结果；实施工作和项目结构分别属于 Work Item 与 Design。
- Machine Event 自动记录状态事实；Operation Log 仍由 LLM 判断语义检查点。
- 用户于 2026-08-28 确认方案、v8 代码设计和 SKILL 下放方案。

## 必须遵守的约束
- 状态改变先追加 Machine Event，再原子生成 State 和投影；失败后可重建。
- blocked 是附加 hold，不覆盖原生命周期阶段。
- 旧 done 没有 valid Verification 时不得迁移为 accepted。
- 读命令只报告 drift，不偷偷修改状态。
- v1–v7 模板保持不可变，自定义内容迁移时保留原件或生成候选。

## 审批委托
- 状态：常规
- 范围：无
- 授权依据：无
