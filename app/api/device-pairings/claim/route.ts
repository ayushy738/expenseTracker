import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { requestAddress, takeAuthAttempt } from "@/lib/auth-throttle";
import { hashDeviceToken } from "@/lib/device-token";
import { hashPairingCode, normalizePairingCode, PAIRING_CODE_PATTERN } from "@/lib/device-pairing";
import { readJsonLimited } from "@/lib/request-body";
import { AuthThrottleModel } from "@/models/AuthThrottle";
import { DeviceModel } from "@/models/Device";
import { DevicePairingChallengeModel } from "@/models/DevicePairingChallenge";

const ClaimSchema = z.object({
  code: z.string().trim().min(1).max(32),
  deviceName: z.string().trim().min(1).max(80),
  deviceToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
}).strict();

function noStore(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && new URL(request.url).protocol !== "https:") {
    return noStore({ message: "HTTPS is required." }, 400);
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return noStore({ message: "JSON is required." }, 415);
  }
  const body = await readJsonLimited(request, 4096);
  const parsed = ClaimSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) return noStore({ message: "Invalid pairing request." }, 400);

  const code = normalizePairingCode(parsed.data.code);
  if (!PAIRING_CODE_PATTERN.test(code)) return noStore({ message: "Pairing code is invalid or expired." }, 404);

  await connectToDatabase();
  await Promise.all([DevicePairingChallengeModel.init(), DeviceModel.init(), AuthThrottleModel.init()]);
  if (!await takeAuthAttempt("pairing-claim", requestAddress(request.headers))) {
    return noStore({ message: "Too many pairing attempts. Try again later." }, 429);
  }

  const codeHash = hashPairingCode(code);
  const tokenHash = hashDeviceToken(parsed.data.deviceToken);
  const challenge = await DevicePairingChallengeModel.findOne({ codeHash }).select("+codeHash");
  if (!challenge) return noStore({ message: "Pairing code is invalid or expired." }, 404);
  if (challenge.expiresAt.getTime() <= Date.now()) return noStore({ message: "Pairing code is invalid or expired." }, 410);

  // A retry after a lost response returns the same device only when its locally
  // generated token matches. A different token cannot reuse a consumed code.
  if (challenge.consumedAt) {
    const priorDevice = challenge.claimedDeviceId
      ? await DeviceModel.findOne({ _id: challenge.claimedDeviceId, tokenHash }).select("_id status")
      : null;
    if (priorDevice) return noStore({ id: String(priorDevice._id), status: priorDevice.status, duplicate: true }, 200);
    return noStore({ message: "Pairing code has already been used." }, 409);
  }

  const session = await mongoose.startSession();
  let claimed: { id: string; status: string } | null = null;
  try {
    await session.withTransaction(async () => {
      const consumed = await DevicePairingChallengeModel.findOneAndUpdate(
        { _id: challenge._id, consumedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { consumedAt: new Date() } },
        { new: true, session }
      );
      if (!consumed) throw new Error("PAIRING_ALREADY_CLAIMED");
      const [device] = await DeviceModel.create([{
        userId: consumed.userId,
        name: parsed.data.deviceName,
        tokenHash,
        status: "PENDING",
        revokedAt: null
      }], { session });
      consumed.claimedDeviceId = device._id;
      await consumed.save({ session });
      claimed = { id: String(device._id), status: device.status };
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PAIRING_ALREADY_CLAIMED") {
      const latest = await DevicePairingChallengeModel.findById(challenge._id);
      const priorDevice = latest?.claimedDeviceId
        ? await DeviceModel.findOne({ _id: latest.claimedDeviceId, tokenHash }).select("_id status")
        : null;
      if (priorDevice) return noStore({ id: String(priorDevice._id), status: priorDevice.status, duplicate: true }, 200);
      return noStore({ message: "Pairing code has already been used." }, 409);
    }
    throw error;
  } finally {
    await session.endSession();
  }
  const claimResult = claimed as { id: string; status: string } | null;
  if (!claimResult) throw new Error("Pairing claim did not create a device.");
  return noStore({ id: claimResult.id, status: claimResult.status, duplicate: false }, 201);
}
