import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { hashSecret, pinPepper, verifySecret } from "@/lib/auth-crypto";
import { UserModel } from "@/models/User";
import { UserSessionModel } from "@/models/UserSession";

const schema = z.object({ pin: z.string().regex(/^\d{4}$/), password: z.string().min(8).max(256) });
export async function PUT(request: Request) {
  const auth = await requireUser({ csrf: true }, request); if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "A four-digit PIN and current password are required." }, { status: 400 });
  const user = await UserModel.findById(auth.context.userId).select("+passwordHash");
  if (!user || !await verifySecret(parsed.data.password, user.passwordHash)) return NextResponse.json({ message: "Current password is incorrect." }, { status: 401 });
  user.pinHash = await hashSecret(parsed.data.pin, pinPepper()); user.pinFailedAttempts = 0; user.pinLockedUntil = null; await user.save();
  await UserSessionModel.updateOne({ _id: auth.context.sessionId, userId: user._id, revokedAt: null }, { $set: { pinUnlockedUntil: new Date(Date.now() + 30 * 60_000) } });
  return NextResponse.json({ ok: true });
}
