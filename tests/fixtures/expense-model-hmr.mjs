import assert from "node:assert/strict";
import mongoose from "mongoose";

const legacySchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  bankTransactionId: mongoose.Schema.Types.ObjectId
});
legacySchema.index({ userId: 1, bankTransactionId: 1 }, { unique: true, sparse: true });
const legacyModel = mongoose.model("Expense", legacySchema);

const { ExpenseModel } = await import("../../models/Expense.ts");
assert.notEqual(ExpenseModel, legacyModel);

await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB });
try {
  await ExpenseModel.init();
  const indexes = await mongoose.connection.db.collection("expenses").indexes();
  assert.ok(!indexes.some((index) => index.name === "userId_1_bankTransactionId_1" && index.sparse === true));
  const expected = indexes.find((index) => index.name === "userId_1_bankTransactionId_objectid_unique");
  assert.equal(expected?.unique, true);
  assert.deepEqual(expected?.partialFilterExpression, { bankTransactionId: { $type: "objectId" } });
} finally {
  await mongoose.disconnect();
}
