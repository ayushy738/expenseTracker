import mongoose from "mongoose";

const { Schema, models } = mongoose;

const DeviceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    tokenHash: { type: String, required: true, unique: true, select: false },
    status: { type: String, enum: ["PENDING", "ACTIVE", "REVOKED"], default: "PENDING", required: true },
    approvedAt: { type: Date, default: null },
    lastUsedAt: { type: Date },
    ingestionWindowStartedAt: { type: Date },
    ingestionCount: { type: Number, default: 0 },
    revokedAt: { type: Date, default: null }
  },
  { timestamps: true }
);
DeviceSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const DeviceModel = models.Device || mongoose.model("Device", DeviceSchema);
