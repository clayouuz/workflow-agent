# Benchmark 清单

## B1 任务级特化包 【done】
### 预期结果
核心初始化只产生通用模板，Agent 可为明确的任务显式启用或撤销 Cocos 特化包，且不会影响其他任务。

### 验收标准
- [x] B1-A1 [auto] 新工作区和新任务默认只有通用设计模板，不产生任何 Cocos 文件或启用状态
- [x] B1-A2 [auto] `ledger pack list/enable/disable` 只作用于当前任务，并在 schema 中准确记录该任务启用的 pack
- [x] B1-A3 [auto] 重复启用结果幂等；现有自定义模板不被覆盖；撤销时不删除自定义内容
- [x] B1-A4 [auto] 未知 pack、未初始化工作区及不安全撤销均明确失败且不留下部分状态

### 步骤
- [x] B1-S1 先编写初始化、任务隔离、启用、撤销和失败路径的黑盒测试
- [x] B1-S2 建立 v3 核心模板、Cocos pack 注册及 schema 表达
- [x] B1-S3 实现 pack CLI 与原子状态更新
- [x] B1-S4 根据实际分支补白盒测试并检查结果

## B2 v2 到 v3 安全迁移 【done】
### 预期结果
现有工作区升级后不再把官方 Cocos 模板当作所有任务的核心文件，同时不损坏自定义内容和既有迁移记录。

### 验收标准
- [x] B2-A1 [auto] v2 未修改的官方 Cocos 模板从原位置移入可恢复归档，且不会自动启用 Cocos pack
- [x] B2-A2 [auto] v2 自定义 Cocos 模板原路径、内容和未启用状态保持不变
- [x] B2-A3 [auto] v3 迁移继承已有 candidates、archives 和已启用 pack 状态，不破坏旧归档恢复
- [x] B2-A4 [auto] v1/v2 到 v3 的迁移可重复执行，冲突或中断时原工作区保持不变

### 步骤
- [x] B2-S1 先编写官方、自定义、继承、幂等和回滚的黑盒迁移测试
- [x] B2-S2 实现多版本模板识别与 Cocos 特化迁移策略
- [x] B2-S3 迁移当前仓库工作区并检查归档、schema 与任务内容
- [x] B2-S4 补充白盒测试并检查恢复路径

## B3 Agent 场景与交付一致性 【done】
### 预期结果
核心评测只表达通用跨系统语义迁移能力，Laya→Cocos 案例只在 Cocos 特化评测中出现，文档与 CLI 行为一致。

### 验收标准
- [x] B3-A1 [manual] 只加载核心场景时，Agent 会检查单位、原点、方向、层级和默认值差异，且不自行假定 Laya 或 Cocos
- [x] B3-A2 [manual] 加载 Cocos 特化场景时，Agent 会针对 Laya→Cocos 主动检查坐标与锚点等引擎语义差异
- [x] B3-A3 [auto] 核心场景不含 Laya/Cocos，Laya→Cocos 只存在于独立的 Cocos 特化评测文件
- [x] B3-A4 [auto] README、CLI 文档、HANDOFF 和帮助文本准确说明特化包的任务级启用方式

### 步骤
- [x] B3-S1 拆分通用与 Cocos 特化 Agent 场景并加入静态回归检查
- [x] B3-S2 同步 CLI 帮助、README、命令文档、HANDOFF 与 CHANGELOG
- [x] B3-S3 运行影响测试、仓库全量测试与 `verify-demo.bat` 并检查实际输出
- [x] B3-S4 提供两组人工场景的自测流程并记录用户结果
