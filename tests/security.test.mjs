import test from "node:test";
import assert from "node:assert/strict";
import { createDeviceToken, hashDeviceToken } from "../lib/device-token.ts";
import { transactionFingerprint } from "../lib/transaction-fingerprint.ts";
import { readJsonLimited } from "../lib/request-body.ts";
import { resolveDatabaseName } from "../lib/mongodb.ts";
import { createPairingCode, hashPairingCode, normalizePairingCode, pairingChallengeExpiry } from "../lib/device-pairing.ts";

test("device tokens are random bearer secrets and only their hashes are stored", () => {
  const token = createDeviceToken();
  assert.equal(token.length, 43);
  assert.notEqual(hashDeviceToken(token), token);
  assert.equal(hashDeviceToken(token), hashDeviceToken(token));
  assert.notEqual(createDeviceToken(), token);
});

test("pairing challenges use a short random code, normalize consistently, and expire after five minutes", () => {
  const code = createPairingCode();
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/);
  assert.equal(hashPairingCode(code), hashPairingCode(` ${code.slice(0, 5)}-${code.slice(5)} `));
  assert.notEqual(hashPairingCode(code), code);
  assert.equal(pairingChallengeExpiry(new Date(0)).getTime(), 5 * 60 * 1000);
  assert.equal(normalizePairingCode(" abcd-2345 "), "ABCD2345");
});

test("transaction fingerprints are stable for bank references and distinguish amounts", () => {
  const first = transactionFingerprint({
    amount: 240.5, transactionType: "DEBIT", bank: " Example Bank ", reference: " UPI 123 ",
    merchant: "Cafe", timestamp: new Date("2026-11-10T10:00:00Z")
  });
  const duplicate = transactionFingerprint({
    amount: 240.5, transactionType: "DEBIT", bank: "example bank", reference: "upi123",
    merchant: "Different presentation", timestamp: new Date("2026-11-10T10:01:00Z")
  });
  const differentAmount = transactionFingerprint({
    amount: 241, transactionType: "DEBIT", bank: "example bank", reference: "upi123",
    timestamp: new Date("2026-11-10T10:00:00Z")
  });
  assert.equal(first, duplicate);
  assert.notEqual(first, differentAmount);
});

test("transaction fingerprints use exact normalized fields when no reference exists", () => {
  const input = { amount: 9.5, transactionType: "DEBIT", bank: "Bank", merchant: " Corner  Shop ", timestamp: new Date("2026-11-10T10:00:00Z") };
  assert.equal(transactionFingerprint(input), transactionFingerprint({ ...input, merchant: "corner shop" }));
  assert.notEqual(transactionFingerprint(input), transactionFingerprint({ ...input, timestamp: new Date("2026-11-10T10:00:01Z") }));
});

test("JSON request reader enforces byte limits and rejects malformed JSON", async () => {
  const valid = await readJsonLimited(new Request("https://example.test", { method: "POST", body: JSON.stringify({ amount: 10 }) }), 32);
  assert.deepEqual(valid, { ok: true, value: { amount: 10 } });
  const large = await readJsonLimited(new Request("https://example.test", { method: "POST", body: "x".repeat(40) }), 32);
  assert.deepEqual(large, { ok: false, reason: "too_large" });
  const malformed = await readJsonLimited(new Request("https://example.test", { method: "POST", body: "{" }), 32);
  assert.deepEqual(malformed, { ok: false, reason: "invalid" });
});

test("explicit MONGODB_DB overrides a URI path and the safe default never reuses it", () => {
  const uri = "mongodb+srv://user:password@example.mongodb.net/legacy_finance?retryWrites=true";
  assert.equal(resolveDatabaseName(uri, "finance_tracker_v2"), "finance_tracker_v2");
  assert.equal(resolveDatabaseName(uri), "finance_tracker_v2");
  assert.equal(resolveDatabaseName("mongodb://localhost:27017/"), "finance_tracker_v2");
});
