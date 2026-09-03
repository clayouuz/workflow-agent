# B5 人工验证记录

日期：2026-08-20

## 固定 Agent 场景

按 `tests/agent-scenarios.md` 静态演练当前提示词和台账入口：

| 场景 | 结果 | 依据 |
|---|---|---|
| S1 精确恢复会话 | 通过 | `current.md` 提供当前 benchmark、step 和精确引用；context 将 history/raw 保持在冷层 |
| S2 局部挂起 | 通过 | step 独立保存 suspended；next 跳过挂起项；current 保留精简原因与恢复条件 |
| S3 主动指出领域差异 | 通过 | strategy 要求提示会改变结果的领域差异；Cocos 特化模板显式检查坐标、锚点和尺寸语义 |
| S4 修改授权边界 | 通过 | workflow 区分 `.workflow` 检查点和项目源码/配置/文档/资源 |
| S5 无法自动验证 | 通过 | workflow 要求给出可执行自测流程并等待结果；manual 证据有独立记录入口 |

检查中未发现固定方案数量、硬性思考形式或要求加载完整历史的限制。

## 代表性上下文

`ledger context` 实际结果：

- 5 个引用
- 3344 字符
- 约 1956 tokens
- 引用仅包含 current、authority、knowledge、B5 benchmark 段落和 B5 design
- 未加载 history、raw、audit 或其他 benchmark

当前会话内容少于 6k–10k 常态参考，但已足以恢复任务；参考值不是最低配额，因此没有填充无关内容。估算低于 15k 警戒和 25k 极限参考。

## 最终脚本

`verify-demo.bat` 七步实际执行完成：34 个仓库自测、16 个影响用例和 34 个正式全量用例均通过；上下文预览和台账状态检查正常。
