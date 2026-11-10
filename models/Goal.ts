import mongoose, { Schema, models } from "mongoose";

const GoalSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    targetAmount: { type: Number, required: true, min: 0 },
    currentAmount: { type: Number, default: 0, min: 0 },
    deadline: { type: Date }
  },
  { timestamps: true }
);
GoalSchema.index({ userId: 1, createdAt: -1 });

export const GoalModel = models.Goal || mongoose.model("Goal", GoalSchema);
