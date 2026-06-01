import mongoose, { Schema, models } from "mongoose";

const GoalSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    targetAmount: { type: Number, required: true, min: 0 },
    currentAmount: { type: Number, default: 0, min: 0 },
    deadline: { type: Date }
  },
  { timestamps: true }
);

export const GoalModel = models.Goal || mongoose.model("Goal", GoalSchema);
