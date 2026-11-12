import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { runInNewContext } from "node:vm";
import manifest from "../app/manifest.ts";
import { acquireSubmission, amountExceedsDeposit, eligibleDeposits, initialDepositId, localDateInputValue, parseRupeesToPaise, paiseToApiAmount } from "../lib/quick-add.ts";

const deposit = (depositId, remainingAmount) => ({ depositId, remainingAmount, source: `Source ${depositId}` });

test("quick-add amount parser keeps decimal rupees exact to paise", () => {
  assert.equal(parseRupeesToPaise("1"), 100);
  assert.equal(parseRupeesToPaise("1.5"), 150);
  assert.equal(parseRupeesToPaise("1,234.56"), 123456);
  assert.equal(parseRupeesToPaise("0.01"), 1);
  assert.equal(paiseToApiAmount(123456), "1234.56");
  for (const invalid of ["", "0", "-1", "1.234", "12,34.00", "1,2345", "abc"]) assert.equal(parseRupeesToPaise(invalid), null, invalid);
});

test("deposit preference is scoped by caller and stale or ineligible selections are ignored", () => {
  const items = [deposit("DEP-001", 0), deposit("DEP-002", 50), deposit("DEP-003", 75)];
  assert.deepEqual(eligibleDeposits(items).map((item) => item.depositId), ["DEP-002", "DEP-003"]);
  assert.equal(initialDepositId(items, "DEP-003"), "DEP-003");
  assert.equal(initialDepositId(items, "DEP-001"), "");
  assert.equal(initialDepositId(items, "deleted-deposit"), "");
  assert.equal(initialDepositId([items[1]], null), "DEP-002");
  assert.equal(amountExceedsDeposit(5001, 50), true);
  assert.equal(amountExceedsDeposit(5000, 50), false);
});

test("local date helper uses local calendar components", () => {
  const local = new Date(2026, 10, 12, 23, 59, 0);
  assert.equal(localDateInputValue(local), "2026-11-12");
});

test("submission lock rejects repeated taps until the request finishes", () => {
  const lock = { current: false };
  assert.equal(acquireSubmission(lock), true);
  assert.equal(acquireSubmission(lock), false);
  lock.current = false;
  assert.equal(acquireSubmission(lock), true);
});

test("PWA manifest declares standalone app identity, shortcut, and public PNG icons", () => {
  const createManifest = typeof manifest === "function" ? manifest : manifest.default;
  const value = createManifest();
  assert.equal(value.name, "Deposit Flow Finance");
  assert.equal(value.short_name, "Deposit Flow");
  assert.equal(value.start_url, "/");
  assert.equal(value.scope, "/");
  assert.equal(value.display, "standalone");
  assert.ok(value.shortcuts.some((shortcut) => shortcut.url === "/quick-add"));
  for (const icon of value.icons) {
    assert.equal(statSync(`public${icon.src}`).isFile(), true);
    const bytes = readFileSync(`public${icon.src}`);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), Number(icon.sizes.split("x")[0]));
    assert.equal(bytes.readUInt32BE(20), Number(icon.sizes.split("x")[1]));
  }
});

test("service worker never caches finance HTML or API responses", async () => {
  const source = readFileSync("public/sw.js", "utf8");
  const listeners = {};
  const written = [];
  const cache = { match: async () => undefined, put: async (request) => written.push(request.url), addAll: async () => {} };
  const self = { location: { origin: "https://finance.test" }, clients: { claim: async () => {} }, skipWaiting: async () => {}, addEventListener: (name, listener) => { listeners[name] = listener; } };
  runInNewContext(source, {
    self,
    caches: { open: async () => cache, keys: async () => [], delete: async () => true, match: async (key) => key === "/offline.html" ? { offline: true } : undefined },
    URL,
    fetch: async (request) => {
      if (request.mode === "navigate") throw new Error("offline");
      return { ok: true, type: "basic", clone() { return this; } };
    },
    Response: { error: () => ({ error: true }) }
  });

  for (const url of ["https://finance.test/api/expenses", "https://finance.test/quick-add"]) {
    let handled = false;
    listeners.fetch({ request: { url, method: "GET", mode: url.endsWith("quick-add") ? "navigate" : "cors" }, respondWith: () => { handled = true; } });
    if (url.includes("/api/")) assert.equal(handled, false);
  }
  let offlineResult;
  listeners.fetch({ request: { url: "https://finance.test/quick-add", method: "GET", mode: "navigate" }, respondWith: (promise) => { offlineResult = promise; } });
  assert.deepEqual(await offlineResult, { offline: true });
  let staticResult;
  listeners.fetch({ request: { url: "https://finance.test/_next/static/chunks/app.js", method: "GET", mode: "cors" }, respondWith: (promise) => { staticResult = promise; } });
  await staticResult;
  assert.deepEqual(written, ["https://finance.test/_next/static/chunks/app.js"]);
});
