# 快照

格式: <Bid>-snapshot.json（由 src/core/snapshot-schema.ts 定义 schema，ledger compile 校验通过后才归档）

快照是编译产物：由 LLM 读历史事件后判断，保留"仍有效约束 / 已取代决策 / 情境性归档"三类结果。
模板见 template.json。
