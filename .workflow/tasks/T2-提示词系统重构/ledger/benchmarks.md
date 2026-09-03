# Benchmark 清单

> 本文件由 workflow-agent 生成，请勿直接编辑。

## B1 核心台账与工作状态 【verifying】

### 验收标准
- [ ] B1-A1 [auto] benchmark 仅使用 pending/in_progress/blocked/done/obsolete 状态
- [ ] B1-A2 [auto] step 可挂起、恢复，且 next 跳过挂起 step
- [ ] B1-A3 [auto] current 可重建当前工作与挂起摘要
- [ ] B1-A4 [auto] 历史事件格式统一，归档使用连续版本并与快照路径一致

## B2 提示词分层与精确上下文 【verifying】

### 验收标准
- [ ] B2-A1 [auto] SKILL/workflow/context/strategy 职责分离且新工作区不生成 rules.md
- [ ] B2-A2 [auto] 新工作区不生成示例 benchmark 和 smoke tests
- [ ] B2-A3 [auto] 通用设计模板与 Cocos 完整特化模板均可独立使用
- [ ] B2-A4 [auto] 支持文件和 Markdown 标题段落级提取、装配与近似 token 估算
- [ ] B2-A5 [manual] Agent 可用精简上下文恢复任务，且不被模板过度限制

## B3 验证证据与验收闭环 【accepted】

### 验收标准
- [ ] B3-A1 [auto] 自动覆盖检查精确到验收项 ID
- [ ] B3-A2 [auto] 验证证据能区分 valid/failed/stale/incomplete
- [ ] B3-A3 [auto] 源码或测试变更会使旧结果过期
- [ ] B3-A4 [auto] 默认验收检查证据，显式 override 可用且可追溯
- [ ] B3-A5 [manual] 无法自动测试时能生成清晰自测流程并记录用户结果

## B4 工作区版本化迁移 【accepted】

### 验收标准
- [ ] B4-A1 [auto] 工作区记录结构版本与模板指纹
- [ ] B4-A2 [auto] 未修改模板可更新，自定义文件保留并生成新版候选
- [ ] B4-A3 [auto] rules.md 可恢复地归档
- [ ] B4-A4 [auto] 迁移可重复执行，失败时不留下半迁移状态

## B5 集成回归与文档收尾 【accepted】

### 验收标准
- [ ] B5-A1 [auto] 新建、切换、挂起、恢复、验证、验收和编译的端到端流程通过
- [ ] B5-A2 [auto] 多任务台账隔离与共享知识行为正确
- [ ] B5-A3 [auto] verify-demo 全绿且全部测试结果有效
- [ ] B5-A4 [manual] 固定 Agent 场景验证通过
- [ ] B5-A5 [manual] 代表性会话的上下文精确且估算量在推荐范围内
