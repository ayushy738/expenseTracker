import test from "node:test";
import assert from "node:assert/strict";
import { TransactionIngestionSchema } from "../lib/transaction-payload.ts";
import { getConfirmationBlock } from "../lib/confirmation-rules.ts";

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
