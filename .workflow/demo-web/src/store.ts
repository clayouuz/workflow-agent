export type ModuleKey = "discussion" | "ledger" | "test" | "tool";
export type BenchStatus = "pending" | "in_progress" | "done" | "revised" | "obsolete" | "blocked";

export interface ModuleInfo {
  key: ModuleKey;
  name: string;
  path: string;
  role: string;
}

export interface Benchmark {
  id: string;
  title: string;
  status: BenchStatus;
  acceptanceTotal: number;
  acceptanceDone: number;
  stepsTotal: number;
  stepsDone: number;
}

export interface AgentState {
  modules: ModuleInfo[];
  benchmarks: Benchmark[];
  currentBenchmarkId: string;
  nextStep: string;
}

const state: AgentState = {
  modules: [
    { key: "discussion", name: "讨论", path: ".workflow/discussion/", role: "引导需求分析，触发专业启发" },
    { key: "ledger", name: "台账", path: ".workflow/tasks/<active>/ledger/", role: "事件式状态机，控制上下文" },
    { key: "test", name: "测试", path: ".workflow/tests/", role: "白盒影响测试 + 黑盒全量测试" },
    { key: "tool", name: "工具扩展", path: ".workflow/tools/", role: "固化机械流程，管理能力边界" },
  ],
  benchmarks: [
    { id: "B1", title: "系统骨架", status: "done", acceptanceTotal: 3, acceptanceDone: 3, stepsTotal: 3, stepsDone: 3 },
    { id: "B2", title: "可视化网页", status: "in_progress", acceptanceTotal: 2, acceptanceDone: 1, stepsTotal: 2, stepsDone: 1 },
  ],
  currentBenchmarkId: "B2",
  nextStep: "实现 renderer.ts 页面渲染",
};

export function getAgentState(): AgentState {
  return state;
}

export function getModules(): ModuleInfo[] {
  return [...state.modules];
}

export function getBenchmarks(): Benchmark[] {
  return state.benchmarks.map((b) => ({ ...b }));
}

export function getCurrentTask(): { benchmark: Benchmark | undefined; nextStep: string } {
  const benchmark = state.benchmarks.find((b) => b.id === state.currentBenchmarkId);
  return { benchmark: benchmark ? { ...benchmark } : undefined, nextStep: state.nextStep };
}

export function updateBenchmarkStatus(id: string, status: BenchStatus): boolean {
  const b = state.benchmarks.find((x) => x.id === id);
  if (!b) return false;
  b.status = status;
  return true;
}

export function advanceStep(id: string): boolean {
  const b = state.benchmarks.find((x) => x.id === id);
  if (!b) return false;
  if (b.stepsDone < b.stepsTotal) {
    b.stepsDone++;
    return true;
  }
  return false;
}

export function setNextStep(step: string): void {
  state.nextStep = step;
}
