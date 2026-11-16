import mongoose from "mongoose";

const { Schema, models } = mongoose;

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
  { unique: true, partialFilterExpression: { bankTransactionId: { $type: "objectId" } } }
);

export const ExpenseModel = models.Expense || mongoose.model("Expense", ExpenseSchema);
