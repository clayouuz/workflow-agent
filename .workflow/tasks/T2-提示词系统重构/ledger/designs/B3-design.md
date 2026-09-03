# B3 验证证据与验收闭环设计

## 预期结果
每个 benchmark 都有可检查的自动与人工证据；失败、缺失或过期不会被当作通过。

## 修改设计
- `core/test-runner.ts` 返回用例级结果、空测试文件和完整时间。
- `core/hash.ts` 对实际源码与测试根生成 SHA-256 指纹。
- `core/verification.ts` 精确关联验收项 ID，合并自动/人工证据并计算 valid/failed/stale/incomplete。
- `commands/test.ts` 编排 run/manual/verify；`ledger accept` 默认只接受 valid，override 必须有原因。

## 黑盒约定
- 测试函数中的 `B3_A1` 仅覆盖 `B3-A1`，不覆盖 `B3-A10`。
- 人工项未记录时 incomplete，记录 pass 后可转 valid。
- 测试失败为 failed；源码或测试变更为 stale；无测试为 incomplete。
- 默认验收拒绝非 valid 证据；override 需用户明确原因。

## 白盒关注点
- 验收后只在证据 valid 时自动勾选验收项，override 不伪造通过勾选。
- 运行开始前先写 incomplete，中断不会留下旧 valid。
- 指纹覆盖实际执行的测试根，不包含证据文件和调用图缓存。

## 人工验证
通过 `test manual <Bid> <Aid> pass|fail` 记录用户按设计文档给出的自测结果。

## 注释要求
只解释指纹边界和验证状态优先级。
