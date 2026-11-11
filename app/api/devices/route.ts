import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { requireUser } from "@/lib/auth";
import { takeAuthAttempt } from "@/lib/auth-throttle";
import { createPairingCode, hashPairingCode, pairingChallengeExpiry } from "@/lib/device-pairing";
import { DeviceModel } from "@/models/Device";
import { DevicePairingChallengeModel } from "@/models/DevicePairingChallenge";
import { AuthThrottleModel } from "@/models/AuthThrottle";
import { readJsonLimited } from "@/lib/request-body";

const PairingSchema = z.object({}).strict();

export async function GET(request: Request) {
  const auth = await requireUser({}, request);
  if (auth.response) return auth.response;
  await connectToDatabase();
  await DeviceModel.init();
  const devices = await DeviceModel.find({ userId: auth.context.userId })
    .select("name status lastUsedAt revokedAt approvedAt createdAt")
    .sort({ createdAt: -1 }).lean();
  return NextResponse.json(devices, { headers: { "Cache-Control": "no-store" } });
}

// Authenticated dashboard action: create a one-time pairing code, never a device token.
export async function POST(request: Request) {
  const auth = await requireUser({ csrf: true }, request);
  if (auth.response) return auth.response;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ message: "JSON is required." }, { status: 415 });
  }
  const body = await readJsonLimited(request, 4096);
  const parsed = PairingSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) return NextResponse.json({ message: "Invalid pairing request." }, { status: 400 });

  await connectToDatabase();
  await Promise.all([DevicePairingChallengeModel.init(), AuthThrottleModel.init()]);
  if (!await takeAuthAttempt("pairing-init", auth.context.userId)) {
    return NextResponse.json({ message: "Too many pairing requests. Try again later." }, { status: 429 });
  }

  const code = createPairingCode();
  const expiresAt = pairingChallengeExpiry();
  await DevicePairingChallengeModel.create({ userId: auth.context.userId, codeHash: hashPairingCode(code), expiresAt });
  return NextResponse.json({ code, expiresAt }, {
    status: 201,
    headers: { "Cache-Control": "no-store", "Pragma": "no-cache", "X-Content-Type-Options": "nosniff" }
  });
}
