import { strict as assert } from "node:assert";
import { escapeHtml, renderBenchmarkRow, renderAgentPage } from "../src/renderer.ts";
import { getBenchmarks } from "../src/store.ts";

export function test_escapeHtml_escapesSpecialChars() {
  assert.equal(escapeHtml('<a href="x">'), "&lt;a href=&quot;x&quot;&gt;");
}

export function test_renderBenchmarkRow_containsStatusText() {
  const b = getBenchmarks().find((x) => x.id === "B2");
  assert.ok(b);
  const html = renderBenchmarkRow(b);
  assert.ok(html.includes("进行中"));
  assert.ok(html.includes("可视化网页"));
}

export function test_renderAgentPage_containsModulesAndBenchmarks() {
  const html = renderAgentPage();
  assert.ok(html.includes("Workflow Agent 系统状态"));
  assert.ok(html.includes("讨论"));
  assert.ok(html.includes("台账"));
  assert.ok(html.includes("B1"));
  assert.ok(html.includes("B2"));
}
