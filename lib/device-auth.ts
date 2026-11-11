import { timingSafeEqual } from "node:crypto";
import { DeviceModel } from "@/models/Device";
import { hashDeviceToken } from "@/lib/device-token";

export async function findDeviceForToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (token.length < 40 || token.length > 100) return null;
  const requestTime = Number(request.headers.get("x-device-timestamp"));
  if (!Number.isFinite(requestTime) || Math.abs(Date.now() - requestTime) > 5 * 60 * 1000) return null;
  const tokenHash = hashDeviceToken(token);
  const device = await DeviceModel.findOne({ tokenHash }).select("+tokenHash");
  if (!device) return null;
  // Hashes are fixed length and token input has high entropy; compare to keep the check constant-time.
  const stored = Buffer.from(device.tokenHash, "hex");
  const received = Buffer.from(tokenHash, "hex");
  if (stored.length !== received.length || !timingSafeEqual(stored, received)) return null;
  return device;
}

export async function authenticateDevice(request: Request) {
  const device = await findDeviceForToken(request);
  if (!device || device.revokedAt || (device.status && device.status !== "ACTIVE")) return null;

  const now = new Date();
  const cutoff = new Date(now.getTime() - 60 * 60 * 1000);
  const updated = await DeviceModel.findOneAndUpdate(
    { _id: device._id, revokedAt: null, $or: [{ status: "ACTIVE" }, { status: { $exists: false } }] },
    [{ $set: {
      ingestionCount: {
        $cond: [
          { $gt: ["$ingestionWindowStartedAt", cutoff] },
          { $add: [{ $ifNull: ["$ingestionCount", 0] }, 1] },
          1
        ]
      },
      ingestionWindowStartedAt: { $cond: [{ $gt: ["$ingestionWindowStartedAt", cutoff] }, "$ingestionWindowStartedAt", now] },
      lastUsedAt: now
    } }],
    { new: true }
  ) as { _id: unknown; userId: unknown; ingestionCount: number } | null;
  if (!updated) return null;
  return { device: updated, userId: String(updated.userId), rateLimited: updated.ingestionCount > 120 };
}

