# B2 提示词分层与精确上下文设计

## 预期结果
每次会话只装配当前决策需要的文件或 Markdown 段落，提示词文件职责唯一且不过度限制模型。

## 修改设计
- 提示词迁到 `templates/v2/`，TypeScript 只保存模板注册与读取逻辑。
- `SKILL.md` 仅作操作入口；workflow/context/strategy 分别承载协作边界、装配方式和非强制启发。
- `core/markdown.ts` 提取唯一标题段，`core/context.ts` 解析引用、约束工作区边界并估算 token。
- `ledger load` 真正输出装配内容并记录实际引用；`ledger context` 预览装配计划。
- knowledge 仅保留精简事实，追溯信息进入冷层 audit。

## 黑盒约定
- 新工作区不生成 rules、示例 benchmark 或 smoke test。
- 通用和 Cocos 特化设计模板都可独立使用。
- `文件#标题` 仅输出指定段落；重复标题和越界路径报错。
- 估算值只提醒，不限制加载。

## 白盒关注点
- current 的标题解析使用逐行状态，不依赖跨段正则。
- 切换 benchmark 时替换旧的自动 benchmark 引用，保留 Agent 显式添加的设计和快照引用。

## 人工验证
审阅四层提示词不强制方案数量或思考格式，并用当前 B2 预览确认装配精确。

## 注释要求
只在路径边界和 current 投影边界保留原因注释。
