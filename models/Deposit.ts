import mongoose, { Schema, models } from "mongoose";

const DepositSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    depositId: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    source: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    savingsAmount: { type: Number, default: 0, min: 0 },
    spendableAmount: { type: Number, default: 0, min: 0 },
    spentAmount: { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, default: 0 },
    savingsFundId: { type: Schema.Types.ObjectId, ref: "SavingsFund" }
  },
  { timestamps: true }
);
DepositSchema.index({ userId: 1, depositId: 1 }, { unique: true });

export const DepositModel = models.Deposit || mongoose.model("Deposit", DepositSchema);
