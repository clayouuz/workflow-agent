# T3 特化内容解耦代码设计

## 预期结果
通用 workflow 不再默认携带 Cocos 模板或 Laya→Cocos 示例；Cocos 能力仍作为轻量、任务级、显式启用的完整特化包存在。

## 范围与非目标
- 修改模板注册、任务初始化、schema、pack CLI、v3 迁移、相关测试和用户文档。
- 不改变上下文预算、workflow 阶段、验证状态模型和 TypeScript 测试方案。
- 不做关键词识别，不自动启用 pack，也不因为启用 pack 就把其内容永久加入每次 `ledger load`。

## 模板与安装结构

```text
templates/v3/
├─ shared/                              v2 通用共享模板的 v3 基线
├─ task/ledger/
│  ├─ designs/README.md                 只说明通用模板和 pack 使用方式
│  └─ designs/template-general.md       默认生成的唯一设计模板
└─ packs/cocos/task/ledger/designs/
   └─ template-cocos-scene.md           Cocos pack 的完整设计模板
```

- `templates/v1/`、`templates/v2/` 保持不可变。
- pack 源文件独立存放；启用后仍安装到兼容路径 `tasks/<id>/ledger/designs/template-cocos-scene.md`，避免改变已有引用习惯。
- 新工作区与 `ledger task new` 只复制 v3 core registry，不复制 pack registry。

## Schema 设计

`schema.json` 增加一个简单的任务级启用表：

```json
{
  "structureVersion": 3,
  "templateVersion": 3,
  "taskPacks": {
    "T2-场景实现": ["cocos"]
  }
}
```

- 缺失 `taskPacks` 按空对象读取，兼容旧 schema。
- pack 名称和任务 ID 使用现有确定性名称，不生成随机 ID。
- 数组去重并排序，确保重复命令不会产生无意义 diff。
- `taskPacks` 只表示显式启用状态；迁移时保留但不擅自推断。v2 自定义 Cocos 文件因此会原样保留，却不会被自动标成已启用。
- v3 schema 创建或迁移时继承旧 `candidates`、`archives`，不能丢失 v1→v2 的可恢复记录。

## CLI 行为

```text
ledger pack list
ledger pack enable cocos
ledger pack disable cocos
```

- `list` 显示可用 pack 及当前任务是否启用，不扫描关键词，不推断项目类型。
- `enable` 只针对当前绑定任务：预检所有目标后创建缺失文件，保留目标位置已有的自定义内容，最后原子写入 schema；重复执行不改文件。
- `enable` 成功后输出可按需加入 `current.md` 的引用，但不自动加入上下文，防止每次会话加载无关领域内容。
- `disable` 只删除与官方 pack 内容一致的文件并移除 schema 状态；发现自定义内容时拒绝删除并保持启用状态，由用户决定如何处理。
- 文件写入或 schema 更新失败时回滚本次创建/删除的官方文件，不能留下“文件存在但 schema 未启用”或相反的部分状态。

## 代码修改位置与职责

### `src/core/templates.ts`
- 将 `CURRENT_SCHEMA_VERSION` 提升到 3。
- current registry 只登记 v3 通用模板；新增带 `id/description/entries` 的 pack registry。
- 保存 v1/v2 受管模板历史，使迁移能判断旧文件是官方基线还是自定义内容。
- 为废弃模板声明数据化策略：普通旧模板沿用可恢复归档；Cocos 模板使用“仅官方版本归档，自定义原地保留”。迁移代码不硬编码引擎名称。

### `src/core/workspace-schema.ts`（新增）
- 承载 `WorkspaceSchema` 类型、兼容读取、规范化、当前 schema 创建和原子写入。
- 当前 schema 创建接收并保留旧 candidates/archives/taskPacks；模板指纹只来自 core registry。
- 这里只处理确定性结构，不判断某个任务是否应该启用 Cocos。

### `src/core/packs.ts`（新增）
- 根据 pack registry 和当前任务执行 list/enable/disable。
- 先完成路径与冲突预检，再更新文件和 schema；只回滚本次实际变更。
- 对目标文件使用 workspace 内安全相对路径，不允许绝对路径或 `..` 逃逸。

### `src/core/migration.ts`
- 改用 `workspace-schema.ts`，保留现有 stage→validate→swap 事务模型。
- 当前 core 文件若匹配任一旧官方版本则升级；自定义 core 文件仍保留并生成 v3 candidate。
- 对旧 Cocos 目标分别比较 v1/v2 官方内容：匹配则归档，不匹配则原样保留且不写 `taskPacks`。
- 校验继承的候选、归档与 pack 状态；重复迁移 v3 时不写文件。

### `src/commands/pack.ts`（新增）、`src/cli.ts`
- 命令层只负责参数校验、调用 core 操作和稳定输出。
- 在 `ledger pack` 下分发 `list/enable/disable`，同步 HELP 和错误提示。
- `src/commands/ledger.ts` 继续只用 core registry 初始化共享目录与任务台账，不包含 pack 判断。

### Agent 场景
- `tests/agent-scenarios.md`：S3 改为不点名技术栈的“跨系统语义迁移”，通过条件检查单位、原点、方向、层级、默认值及其验证影响。
- `tests/agent-scenarios-cocos.md`（新增）：保存 Laya→Cocos 的坐标、锚点、尺寸和层级案例；上下文明确包含已启用的 Cocos 模板。
- 核心模板和通用启发策略不新增 Cocos 知识；Cocos 知识只在 pack 模板与特化评测中维护。

### 测试与文档
- `tests/packs-t3.test.ts`（新增）：覆盖 B1 的黑盒命令、任务隔离、幂等、自定义保护和失败路径。
- `tests/migration-v3-t3.test.ts`（新增）：覆盖 B2 的 v2 官方/自定义分类、旧记录继承、v1/v2 升级、幂等与回滚。
- `tests/context-b2.test.ts`：把旧的“初始化后直接读取 Cocos 模板”回归改为“显式 enable 后与通用模板独立可用”。
- `tests/migration-b4.test.ts`：将历史 B4 回归的当前版本断言和 candidate 路径更新为 v3，仍保留原有 v1 迁移覆盖。
- `tests/scenario-separation-t3.test.ts`（新增）：静态保证通用场景无 Laya/Cocos、特化场景包含对应案例。
- `README.md`、`docs/cli-commands.md`、`HANDOFF.md`、`CHANGELOG.md`：说明 v3、pack 命令、默认不生成 Cocos 与迁移结果。

## 黑盒约定（实现前先写）
- init/new：通用模板存在，Cocos 目标不存在，schema 无任务 pack。
- enable：只在当前任务创建 Cocos 模板并登记 schema；其他任务不变化。
- enable 幂等：第二次执行前后模板和 schema 字节一致。
- 自定义保护：目标已有不同内容时 enable 保留内容；disable 明确失败且文件/schema 不变。
- 失败路径：未知 pack、未初始化、目标路径冲突、schema 写入失败均返回非零，工作区无部分修改。
- migrate：官方 Cocos 被归档且可 restore；自定义 Cocos 原样保留；旧 candidates/archives 仍可读取与恢复；第二次迁移不写文件；暂存冲突后原工作区字节不变。

## 白盒验证关注点
实现后根据实际分支补充：schema 默认值与排序、pack 文件回滚、多个旧官方版本匹配、废弃策略分支、迁移记录合并去重、安全路径和原子提交恢复。

## 人工验证

### 通用场景
1. 只提供通用 `strategy.md` 和跨系统迁移资料，不提供任何引擎名。
2. 要求 Agent 规划语义迁移。
3. 预期 Agent 主动检查会影响结果的单位、原点、方向、层级、默认值，不自行引入 Laya/Cocos。

### Cocos 特化场景
1. 对测试任务执行 `ledger pack enable cocos`，按需加载 Cocos 模板和特化场景。
2. 提出 Laya UI/角色位置迁移到 Cocos 的任务。
3. 预期 Agent 主动指出坐标、锚点、尺寸或层级语义差异及对应验证方式，不罗列无关引擎知识。

## 注释要求
- 在旧 Cocos 自定义文件原地保留处注释原因：默认生成的历史使“存在文件”不能证明用户启用了 pack。
- 在 pack 回滚处注释只回滚本次变更，避免破坏预先存在的自定义内容。
- 在 schema 记录继承处注释兼容原因：旧归档仍需支持 `ledger migrate restore`。
- 其余函数、参数和直观控制流不写复述性注释。
