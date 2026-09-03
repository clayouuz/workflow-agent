import { getModules, getBenchmarks, getCurrentTask } from "./store.ts";
import type { Benchmark, BenchStatus, ModuleInfo } from "./store.ts";

const STATUS_TEXT: Record<BenchStatus, string> = {
  pending: "待办",
  in_progress: "进行中",
  done: "完成",
  revised: "已修订",
  obsolete: "已废弃",
  blocked: "阻塞",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[ch] ?? ch;
  });
}

export function renderModuleCard(m: ModuleInfo): string {
  return [
    `<article class="module-card">`,
    `<h2>${escapeHtml(m.name)}</h2>`,
    `<code>${escapeHtml(m.path)}</code>`,
    `<p>${escapeHtml(m.role)}</p>`,
    `</article>`,
  ].join("\n");
}

export function renderBenchmarkRow(b: Benchmark): string {
  const pct = b.acceptanceTotal === 0 ? 0 : Math.round((b.acceptanceDone / b.acceptanceTotal) * 100);
  return `<tr data-id="${b.id}"><td>${b.id}</td><td>${escapeHtml(b.title)}</td><td>${STATUS_TEXT[b.status]}</td><td>${pct}%</td></tr>`;
}

export function renderCurrentTask(benchmark: Benchmark | undefined, nextStep: string): string {
  if (!benchmark) {
    return `<section class="current-task"><h2>当前任务</h2><p>暂无 benchmark</p></section>`;
  }
  return [
    `<section class="current-task">`,
    `<h2>当前大 benchmark：${benchmark.id} ${escapeHtml(benchmark.title)}</h2>`,
    `<p>下一步：${escapeHtml(nextStep)}</p>`,
    `</section>`,
  ].join("\n");
}

export function renderAgentPage(): string {
  const modules = getModules();
  const benchmarks = getBenchmarks();
  const { benchmark, nextStep } = getCurrentTask();
  const moduleCards = modules.map((m) => renderModuleCard(m)).join("\n");
  const rows = benchmarks.map((b) => renderBenchmarkRow(b)).join("\n");
  return [
    `<!doctype html>`,
    `<html><head><meta charset="utf-8"><title>Workflow Agent 可视化</title></head>`,
    `<body>`,
    `<h1>Workflow Agent 系统状态</h1>`,
    renderCurrentTask(benchmark, nextStep),
    `<h2>模块</h2>`,
    moduleCards,
    `<h2>Benchmark 清单</h2>`,
    `<table border="1"><thead><tr><th>ID</th><th>标题</th><th>状态</th><th>验收进度</th></tr></thead><tbody>`,
    rows,
    `</tbody></table>`,
    `</body></html>`,
  ].join("\n");
}
