import mongoose, { Schema, models } from "mongoose";

const UserSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  pinHash: { type: String, select: false, default: undefined },
  pinFailedAttempts: { type: Number, default: 0 },
  pinLockedUntil: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
UserSchema.index({ email: 1 }, { unique: true });

export const UserModel = models.User || mongoose.model("User", UserSchema);
