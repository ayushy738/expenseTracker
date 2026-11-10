import mongoose, { Schema, models } from "mongoose";

const UserSessionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
  pinUnlockedUntil: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});
UserSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const UserSessionModel = models.UserSession || mongoose.model("UserSession", UserSessionSchema);
