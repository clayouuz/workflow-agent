# 常驻 CLI 测试进程设计

## 目标
测试夹具复用 Node CLI 进程，避免每次 `ws.run` 都重新加载 TypeScript 和命令入口。

## 具体方案
将 `src/cli.ts` 重构为可导入的 `runCli(args)`，直接执行时保留原有入口行为；新增测试专用 NDJSON worker，启动后逐行接收参数并返回捕获的 stdout/stderr 与退出码。每个工作区槽位持有一个 worker，cleanup 释放槽位但保留进程，下次获取前清空工作区；worker 异常退出时拒绝请求并允许槽位重启。

## 验收方式
验证生产 CLI 直接调用输出不变、worker 多次请求顺序和错误码正确、夹具槽位复用且不同槽位隔离；全量测试、影响测试和 verify-demo 通过，并记录独立 tests/run.ts 耗时。
