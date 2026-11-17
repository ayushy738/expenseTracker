import mongoose from "mongoose";

const { Schema, models } = mongoose;
export const BANK_TRANSACTION_EXPENSE_INDEX = "userId_1_bankTransactionId_objectid_unique";

const ExpenseSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    category: {
      type: String,
      enum: ["Food", "Education", "Travel", "Personal", "Medical", "Entertainment", "Shopping", "Bills", "Other"],
      required: true
    },
    description: { type: String, trim: true, default: "" },
    depositId: { type: String, required: true, index: true },
    depositReference: { type: Schema.Types.ObjectId, ref: "Deposit", required: true },
    bankTransactionId: { type: Schema.Types.ObjectId, ref: "BankTransaction" },
    isTest: { type: Boolean, default: false },
    isReversed: { type: Boolean, default: false },
    reversedAt: { type: Date },
    reversalReason: { type: String, trim: true, maxlength: 240 },
    date: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

ExpenseSchema.index({ userId: 1, depositId: 1, date: -1 });
// Sparse compound indexes still index a document when another indexed field
// (userId) exists. Restrict uniqueness to genuine ObjectId links instead.
ExpenseSchema.index(
  { userId: 1, bankTransactionId: 1 },
  { name: BANK_TRANSACTION_EXPENSE_INDEX, unique: true, partialFilterExpression: { bankTransactionId: { $type: "objectId" } } }
);

function hasObsoleteBankIndex(model: typeof models.Expense) {
  return model?.schema.indexes().some(([keys, options]) =>
    keys.userId === 1 && keys.bankTransactionId === 1 && options.unique === true && options.sparse === true
  ) ?? false;
}

// Next.js development HMR preserves mongoose.models across module reloads.
// Replace only a cached Expense model with the known obsolete index signature.
export function getExpenseModel() {
  if (hasObsoleteBankIndex(models.Expense)) mongoose.deleteModel("Expense");
  return models.Expense || mongoose.model("Expense", ExpenseSchema);
}

export const ExpenseModel = getExpenseModel();
