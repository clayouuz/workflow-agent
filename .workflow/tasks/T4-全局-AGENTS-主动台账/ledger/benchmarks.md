# Benchmark 清单

> 本文件由 workflow-agent 生成，请勿直接编辑。

## B1 全局主动台账入口 【obsolete】

### 验收标准
- [ ] B1-A1 [auto] 全局 `AGENTS.md` 保留开发阶段与确认规则
- [ ] B1-A2 [auto] 指令要求收到任务请求时主动读取 workflow skill，并优先语义匹配已有任务
- [ ] B1-A3 [auto] 指令要求命中后 bind + load，无命中才创建，多项命中无法判断时提问
- [ ] B1-A4 [manual] 新会话中提到已有任务时，Agent 会主动绑定并加载对应上下文
