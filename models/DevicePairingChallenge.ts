import mongoose, { Schema, models } from "mongoose";

const DevicePairingChallengeSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  codeHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
  claimedDeviceId: { type: Schema.Types.ObjectId, ref: "Device", default: null }
}, { timestamps: true });

DevicePairingChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
DevicePairingChallengeSchema.index({ userId: 1, createdAt: -1 });

export const DevicePairingChallengeModel = models.DevicePairingChallenge ||
  mongoose.model("DevicePairingChallenge", DevicePairingChallengeSchema);
