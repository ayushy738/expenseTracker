import mongoose, { Schema, models } from "mongoose";

const SavingsFundSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    savedAmount: { type: Number, default: 0, min: 0 },
    goalAmount: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

export const SavingsFundModel = models.SavingsFund || mongoose.model("SavingsFund", SavingsFundSchema);
