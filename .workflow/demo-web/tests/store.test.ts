import { strict as assert } from "node:assert";
import {
  getModules,
  getBenchmarks,
  getCurrentTask,
  updateBenchmarkStatus,
  advanceStep,
  setNextStep,
} from "../src/store.ts";

export function test_getModules_returnsFourModules() {
  const modules = getModules();
  assert.equal(modules.length, 4);
  assert.deepStrictEqual(
    modules.map((m) => m.key),
    ["discussion", "ledger", "test", "tool"],
  );
}

export function test_getCurrentTask_returnsInProgressBenchmark() {
  const { benchmark, nextStep } = getCurrentTask();
  assert.ok(benchmark);
  assert.equal(benchmark.id, "B2");
  assert.equal(benchmark.status, "in_progress");
  assert.ok(nextStep.length > 0);
}

export function test_updateBenchmarkStatus_changesStatus() {
  const before = getBenchmarks().find((b) => b.id === "B2");
  assert.equal(before.status, "in_progress");
  assert.equal(updateBenchmarkStatus("B2", "done"), true);
  assert.equal(getBenchmarks().find((b) => b.id === "B2").status, "done");
  updateBenchmarkStatus("B2", "in_progress");
  assert.equal(updateBenchmarkStatus("B9", "done"), false);
}

export function test_advanceStep_incrementsAndClamps() {
  const before = getBenchmarks().find((b) => b.id === "B2").stepsDone;
  assert.equal(advanceStep("B2"), true);
  assert.equal(getBenchmarks().find((b) => b.id === "B2").stepsDone, before + 1);
  assert.equal(advanceStep("B2"), false);
}

export function test_setNextStep_updatesCurrentTask() {
  setNextStep("实现测试框架");
  assert.equal(getCurrentTask().nextStep, "实现测试框架");
  setNextStep("实现 renderer.ts 页面渲染");
}
