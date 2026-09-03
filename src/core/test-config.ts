import { join } from "node:path";
import { exists, readJson, writeText } from "./fs.ts";
import { PATHS } from "./workspace.ts";
import { expandUserPath, toPortablePath } from "./paths.ts";

export interface TestConfig {
  /** 被测源码目录（纯 TS 逻辑，不依赖 Cocos 运行时） */
  sourceRoots: string[];
  /** 测试文件目录 */
  testRoots: string[];
  /** 排除规则（子串匹配） */
  exclude: string[];
}

export const DEFAULT_CONFIG: TestConfig = {
  sourceRoots: [],
  testRoots: [],
  exclude: [".d.ts", "node_modules"],
};

export function configPath(): string {
  return join(PATHS.tests, "config.json");
}

export async function readConfig(): Promise<TestConfig> {
  const p = configPath();
  if (!(await exists(p))) {
    return { ...DEFAULT_CONFIG, testRoots: [PATHS.tests] };
  }
  const data = (await readJson(p)) as Partial<TestConfig>;
  const testRoots = Array.isArray(data.testRoots) ? data.testRoots : [];
  return {
    sourceRoots: Array.isArray(data.sourceRoots) ? data.sourceRoots.map((root) => expandUserPath(root)) : [],
    testRoots: [...new Set([PATHS.tests, ...testRoots.map((root) => expandUserPath(root))])],
    exclude: Array.isArray(data.exclude) && data.exclude.length > 0 ? data.exclude : DEFAULT_CONFIG.exclude,
  };
}

export async function writeConfig(config: TestConfig): Promise<void> {
  const portable = {
    ...config,
    sourceRoots: config.sourceRoots.map(toPortablePath),
    testRoots: config.testRoots.map(toPortablePath),
  };
  await writeText(configPath(), JSON.stringify(portable, null, 2) + "\n");
}
