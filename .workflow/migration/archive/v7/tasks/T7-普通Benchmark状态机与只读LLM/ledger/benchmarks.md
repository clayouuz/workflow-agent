# Benchmark 清单

每个 benchmark 描述一个可独立验收的结果。验收项使用唯一 ID，并标记 `[auto]` 或 `[manual]`。

## B8 v8 普通状态机与只读投影 【in_progress】

### 验收标准
- [ ] B8-A1 [auto] Benchmark 和 Work Item 的合法迁移通过、非法跳跃拒绝且 blocked 保留原阶段
- [ ] B8-A2 [auto] 语义文档变化导致 drift，accepted 和 done 不能沿用旧指纹或证据
- [ ] B8-A3 [auto] Machine Event append-only，State 与投影删除后可确定性重建
- [ ] B8-A4 [auto] v7→v8 拆分 Benchmark/Step 并且无 valid Verification 的旧 done 不迁移为 accepted
- [ ] B8-A5 [auto] SKILL 精简并正确下放，上下文默认规模下降且现有 Operation Log、Pack、Knowledge、Delegation 不回归
- [ ] B8-A6 [auto] 影响、全量和 verify-demo 验证通过

### 步骤
- [ ] B8-S1 编写状态机、drift、事件重建和迁移失败测试
- [ ] B8-S2 实现状态 Core、CLI 与只读投影
- [ ] B8-S3 实现 v8 模板、迁移和兼容入口
- [ ] B8-S4 精简 SKILL、同步规则和文档
- [ ] B8-S5 执行完整验证和真实工作区迁移

