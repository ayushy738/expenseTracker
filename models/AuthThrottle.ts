import mongoose, { Schema, models } from "mongoose";

const AuthThrottleSchema = new Schema({
  key: { type: String, required: true, unique: true },
  windowStartedAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  blockedUntil: { type: Date, default: null },
  expiresAt: { type: Date, required: true }
});
AuthThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthThrottleModel = models.AuthThrottle || mongoose.model("AuthThrottle", AuthThrottleSchema);
