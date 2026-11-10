import test from "node:test";
import assert from "node:assert/strict";
import { BankTransactionModel } from "../models/BankTransaction.ts";
import { ExpenseModel } from "../models/Expense.ts";
import { DeviceModel } from "../models/Device.ts";
import { DepositModel } from "../models/Deposit.ts";
import { SavingsFundModel } from "../models/SavingsFund.ts";
import { GoalModel } from "../models/Goal.ts";

test("transaction and expense models enforce duplicate links without relaxing deposit requirements", () => {
  const fingerprintIndex = BankTransactionModel.schema.indexes().find(([keys]) => keys.fingerprint === 1);
  assert.equal(fingerprintIndex?.[1]?.unique, true);

  const expenseTransactionIndex = ExpenseModel.schema.indexes().find(([keys]) => keys.bankTransactionId === 1);
  assert.equal(expenseTransactionIndex?.[1]?.unique, true);
  assert.equal(expenseTransactionIndex?.[1]?.sparse, true);
  assert.equal(ExpenseModel.schema.path("depositId").isRequired, true);
  assert.equal(ExpenseModel.schema.path("depositReference").isRequired, true);
});

test("transaction status model supports review, ignore, and reversal history", () => {
  const allowed = BankTransactionModel.schema.path("status").enumValues;
  assert.deepEqual(allowed, ["PENDING", "CONFIRMED", "IGNORED", "REVERSED"]);
});

test("device model keeps only a hidden token hash and a revocation marker", () => {
  assert.equal(DeviceModel.schema.path("tokenHash").options.select, false);
  assert.ok(DeviceModel.schema.path("revokedAt"));
});

test("all user-owned finance and device models require owner references and use owner-scoped uniqueness", () => {
  for (const model of [DepositModel, ExpenseModel, SavingsFundModel, GoalModel, BankTransactionModel, DeviceModel]) {
    assert.equal(model.schema.path("userId").isRequired, true, `${model.modelName} userId should be required`);
  }
  assert.ok(DepositModel.schema.indexes().some(([keys, options]) => keys.userId === 1 && keys.depositId === 1 && options.unique));
  assert.ok(BankTransactionModel.schema.indexes().some(([keys, options]) => keys.userId === 1 && keys.fingerprint === 1 && options.unique));
  assert.ok(ExpenseModel.schema.indexes().some(([keys, options]) => keys.userId === 1 && keys.bankTransactionId === 1 && options.unique && options.sparse));
});
