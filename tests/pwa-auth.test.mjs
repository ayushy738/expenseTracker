import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runWhileBusy } from "../lib/auth-form-state.ts";

test("auth form loading state clears after successful completion", async () => {
  const states = [];
  const value = await runWhileBusy((busy) => states.push(busy), async () => "authenticated");
  assert.equal(value, "authenticated");
  assert.deepEqual(states, [true, false]);
});

test("auth form loading state clears after validation, network, and unexpected failures", async () => {
  for (const failure of [new Error("Invalid email or password."), new TypeError("Network unavailable"), new Error("Unexpected form error")]) {
    const states = [];
    await assert.rejects(runWhileBusy((busy) => states.push(busy), async () => { throw failure; }), failure);
    assert.deepEqual(states, [true, false]);
  }
});

test("login, registration, and PIN success use a no-store same-origin request and fresh navigation", () => {
  const source = readFileSync("components/auth-forms.tsx", "utf8");
  assert.match(source, /runWhileBusy\(setBusy, async \(\) => \{/);
  assert.match(source, /fetch\(`\/api\/auth\/\$\{mode\}`/);
  assert.match(source, /fetch\("\/api\/auth\/pin\/unlock"/);
  assert.match(source, /credentials: "same-origin", cache: "no-store"/);
  assert.match(source, /window\.location\.assign\("\/"\)/);
  assert.doesNotMatch(source, /router\.(?:replace|refresh)\(/);
});
