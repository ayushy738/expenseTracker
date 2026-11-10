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

test("confirmation guards require a pending debit with enough deposit balance", () => {
  const debit = { status: "PENDING", transactionType: "DEBIT", amount: 50 };
  assert.equal(getConfirmationBlock(debit, { remainingAmount: 50 }), null);
  assert.equal(getConfirmationBlock({ ...debit, status: "CONFIRMED" }, { remainingAmount: 100 }).status, 409);
  assert.equal(getConfirmationBlock({ ...debit, transactionType: "CREDIT" }, { remainingAmount: 100 }).status, 400);
  assert.equal(getConfirmationBlock(debit, null).status, 404);
  assert.equal(getConfirmationBlock(debit, { remainingAmount: 49.99 }).status, 400);
});
