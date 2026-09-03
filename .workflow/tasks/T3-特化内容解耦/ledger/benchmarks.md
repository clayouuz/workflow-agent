# Benchmark 清单

> 本文件由 workflow-agent 生成，请勿直接编辑。

## B1 任务级特化包 【accepted】

### 验收标准
- [ ] B1-A1 [auto] 新工作区和新任务默认只有通用设计模板，不产生任何 Cocos 文件或启用状态
- [ ] B1-A2 [auto] `ledger pack list/enable/disable` 只作用于当前任务，并在 schema 中准确记录该任务启用的 pack
- [ ] B1-A3 [auto] 重复启用结果幂等；现有自定义模板不被覆盖；撤销时不删除自定义内容
- [ ] B1-A4 [auto] 未知 pack、未初始化工作区及不安全撤销均明确失败且不留下部分状态

## B2 v2 到 v3 安全迁移 【accepted】

### 验收标准
- [ ] B2-A1 [auto] v2 未修改的官方 Cocos 模板从原位置移入可恢复归档，且不会自动启用 Cocos pack
- [ ] B2-A2 [auto] v2 自定义 Cocos 模板原路径、内容和未启用状态保持不变
- [ ] B2-A3 [auto] v3 迁移继承已有 candidates、archives 和已启用 pack 状态，不破坏旧归档恢复
- [ ] B2-A4 [auto] v1/v2 到 v3 的迁移可重复执行，冲突或中断时原工作区保持不变

## B3 Agent 场景与交付一致性 【accepted】

### 验收标准
- [ ] B3-A1 [manual] 只加载核心场景时，Agent 会检查单位、原点、方向、层级和默认值差异，且不自行假定 Laya 或 Cocos
- [ ] B3-A2 [manual] 加载 Cocos 特化场景时，Agent 会针对 Laya→Cocos 主动检查坐标与锚点等引擎语义差异
- [ ] B3-A3 [auto] 核心场景不含 Laya/Cocos，Laya→Cocos 只存在于独立的 Cocos 特化评测文件
- [ ] B3-A4 [auto] README、CLI 文档、HANDOFF 和帮助文本准确说明特化包的任务级启用方式
