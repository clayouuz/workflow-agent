import { strict as assert } from "node:assert";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { createTestWorkspace } from "./helpers/cli.ts";

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export async function test_T11_A1_workspace_fixture_reuses_root_and_resets_workflow() {
  const first = await createTestWorkspace();
  const root = first.root;
  await first.write("marker.txt", "stale");
  await first.cleanup();

  const second = await createTestWorkspace();
  try {
    assert.equal(second.root, root);
    assert.equal(await exists(join(second.workflow, "marker.txt")), false);
  } finally { await second.cleanup(); }
}

export async function test_T11_A2_simultaneous_fixtures_keep_distinct_roots() {
  const first = await createTestWorkspace();
  const second = await createTestWorkspace();
  try {
    assert.notEqual(first.root, second.root);
    await first.write("marker.txt", "first");
    assert.equal(await exists(join(second.workflow, "marker.txt")), false);
  } finally {
    await first.cleanup();
    await second.cleanup();
  }
}
