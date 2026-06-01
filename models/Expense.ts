import mongoose, { Schema, models } from "mongoose";

const ExpenseSchema = new Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    category: {
      type: String,
      enum: ["Food", "Education", "Travel", "Personal", "Medical", "Entertainment", "Shopping", "Bills", "Other"],
      required: true
    },
    description: { type: String, trim: true, default: "" },
    depositId: { type: String, required: true, index: true },
    depositReference: { type: Schema.Types.ObjectId, ref: "Deposit", required: true },
    date: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

export const ExpenseModel = models.Expense || mongoose.model("Expense", ExpenseSchema);
