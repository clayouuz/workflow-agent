import { strict as assert } from "node:assert";

export function test_addition_basics() {
  assert.equal(1 + 1, 2);
}

export function test_string_uppercase() {
  assert.equal("abc".toUpperCase(), "ABC");
}

export async function test_async_support() {
  await new Promise((r) => setTimeout(r, 1));
  assert.ok(true);
}
