import mongoose from "mongoose";

const { Schema, models } = mongoose;

const BankTransactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    transactionType: { type: String, enum: ["DEBIT", "CREDIT"], required: true },
    merchant: { type: String, trim: true, maxlength: 160, default: "" },
    bank: { type: String, trim: true, maxlength: 100, default: "" },
    reference: { type: String, trim: true, maxlength: 120, default: "" },
    timestamp: { type: Date, required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: "Device", required: true },
    depositId: { type: String, index: true },
    category: { type: String, default: "Other" },
    status: { type: String, enum: ["PENDING", "CONFIRMED", "IGNORED", "REVERSED"], default: "PENDING" },
    fingerprint: { type: String, required: true },
    expenseId: { type: Schema.Types.ObjectId, ref: "Expense" },
    supersedesTransactionId: { type: Schema.Types.ObjectId, ref: "BankTransaction" },
    correctedTransactionId: { type: Schema.Types.ObjectId, ref: "BankTransaction" },
    history: [{ action: { type: String, enum: ["CONFIRMED", "IGNORED", "REVERSED", "CORRECTED"], required: true }, at: { type: Date, required: true }, reason: { type: String, maxlength: 240 }, snapshot: { type: Schema.Types.Mixed } }]
  },
  { timestamps: true }
);

BankTransactionSchema.index({ userId: 1, fingerprint: 1 }, { unique: true });
BankTransactionSchema.index({ userId: 1, status: 1, timestamp: -1, _id: -1 });

export const BankTransactionModel = models.BankTransaction || mongoose.model("BankTransaction", BankTransactionSchema);
