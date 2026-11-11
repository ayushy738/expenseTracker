import test from "node:test";
import assert from "node:assert/strict";
import { E2eTransactionIngestionSchema, TransactionIngestionSchema } from "../lib/transaction-payload.ts";
import { getConfirmationBlock } from "../lib/confirmation-rules.ts";
import { isConfiguredE2eEmail, isE2eTestModeEnabled, isE2eTestRequest } from "../lib/e2e-test-mode.ts";

test("ingestion accepts normalized fields and rejects SMS bodies or invalid amounts", () => {
  const valid = TransactionIngestionSchema.safeParse({
    amount: 10.25, transactionType: "DEBIT", bank: "Bank", timestamp: "2026-11-10T10:00:00Z"
  });
  assert.equal(valid.success, true);
  assert.equal(TransactionIngestionSchema.safeParse({
    amount: 10, transactionType: "DEBIT", timestamp: "2026-11-10T10:00:00Z", smsBody: "OTP 123456"
  }).success, false);
  assert.equal(TransactionIngestionSchema.safeParse({
    amount: 10.123, transactionType: "DEBIT", timestamp: "2026-11-10T10:00:00Z"
  }).success, false);
});

test("ingestion accepts an optional UUID captureId and rejects malformed capture IDs", () => {
  const base = { amount: 10, transactionType: "DEBIT", timestamp: "2026-11-10T10:00:00Z" };
  assert.equal(TransactionIngestionSchema.safeParse({ ...base, captureId: "89c2a858-ff40-4f3d-98f1-d6a2d2c10330" }).success, true);
  assert.equal(TransactionIngestionSchema.parse({ ...base, captureId: "89C2A858-FF40-4F3D-98F1-D6A2D2C10330" }).captureId, "89c2a858-ff40-4f3d-98f1-d6a2d2c10330");
  assert.equal(TransactionIngestionSchema.safeParse({ ...base, captureId: "capture-1" }).success, false);
  assert.equal(TransactionIngestionSchema.safeParse(base).success, true);
});

test("confirmation guards require a pending debit with enough deposit balance", () => {
  const debit = { status: "PENDING", transactionType: "DEBIT", amount: 50 };
  assert.equal(getConfirmationBlock(debit, { remainingAmount: 50 }), null);
  assert.equal(getConfirmationBlock({ ...debit, status: "CONFIRMED" }, { remainingAmount: 100 }).status, 409);
  assert.equal(getConfirmationBlock({ ...debit, transactionType: "CREDIT" }, { remainingAmount: 100 }).status, 400);
  assert.equal(getConfirmationBlock(debit, null).status, 404);
  assert.equal(getConfirmationBlock(debit, { remainingAmount: 49.99 }).status, 400);
});

test("E2E test mode fails closed outside local development and isolated databases", () => {
  const base = {
    NODE_ENV: "development",
    E2E_TEST_MODE: "true",
    E2E_TEST_USER_EMAIL: "e2e@example.test",
    MONGODB_DB: "finance_tracker_e2e",
    MONGODB_URI: "mongodb://127.0.0.1:27018/finance_tracker_e2e?replicaSet=rs0",
  };
  assert.equal(isE2eTestModeEnabled(base), true);
  assert.equal(isE2eTestModeEnabled({ ...base, NODE_ENV: "production" }), false);
  assert.equal(isE2eTestModeEnabled({ ...base, VERCEL_ENV: "production" }), false);
  assert.equal(isE2eTestModeEnabled({ ...base, MONGODB_DB: "finance_tracker" }), false);
  assert.equal(isE2eTestModeEnabled({ ...base, MONGODB_URI: "mongodb+srv://cluster.example/test" }), false);
  assert.equal(isConfiguredE2eEmail("E2E@example.test", base), true);
  assert.equal(isConfiguredE2eEmail("other@example.test", base), false);
  assert.equal(isE2eTestRequest(new Request("https://local.test/api/sms", { headers: { "x-deposit-flow-e2e": "1" } })), true);
});

test("normal ingestion schema rejects test-only client flags while E2E schema requires explicit test provenance", () => {
  const base = {
    captureId: "89c2a858-ff40-4f3d-98f1-d6a2d2c10330",
    amount: 2.5,
    transactionType: "DEBIT",
    timestamp: "2026-11-10T10:00:00Z",
  };
  const testFields = { ...base, isTest: true, testRunId: "89c2a858-ff40-4f3d-98f1-d6a2d2c10331" };
  assert.equal(TransactionIngestionSchema.safeParse(testFields).success, false);
  assert.equal(E2eTransactionIngestionSchema.safeParse(testFields).success, true);
  assert.equal(E2eTransactionIngestionSchema.safeParse({ ...base, isTest: false, testRunId: "not-a-uuid" }).success, false);
});
