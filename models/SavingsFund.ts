import mongoose, { Schema, models } from "mongoose";

const SavingsFundSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    savedAmount: { type: Number, default: 0, min: 0 },
    goalAmount: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);
SavingsFundSchema.index({ userId: 1, createdAt: -1 });

export const SavingsFundModel = models.SavingsFund || mongoose.model("SavingsFund", SavingsFundSchema);
