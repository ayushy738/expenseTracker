import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { PIN_UNLOCK_MINUTES, pinPepper, verifySecret } from "@/lib/auth-crypto";
import { UserModel } from "@/models/User";
import { UserSessionModel } from "@/models/UserSession";

const schema = z.object({ pin: z.string().regex(/^\d{4}$/) });
export async function POST(request: Request) {
  const auth = await requireUser({ allowPinLocked: true, csrf: true }, request); if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Enter a four-digit PIN." }, { status: 400 });
  const user = await UserModel.findById(auth.context.userId).select("+pinHash");
  if (!user?.pinHash) return NextResponse.json({ message: "Set a PIN after signing in with your password." }, { status: 409 });
  if (user.pinLockedUntil && user.pinLockedUntil > new Date()) return NextResponse.json({ message: "PIN locked. Sign in again with your password." }, { status: 423 });
  if (!await verifySecret(parsed.data.pin, user.pinHash, pinPepper())) {
    const now = new Date(); const lockUntil = new Date(now.getTime() + 15 * 60_000);
    const updated = await UserModel.findOneAndUpdate(
      { _id: user._id, $or: [{ pinLockedUntil: null }, { pinLockedUntil: { $lte: now } }, { pinLockedUntil: { $exists: false } }] },
      [
        { $set: { pinFailedAttempts: { $add: [{ $ifNull: ["$pinFailedAttempts", 0] }, 1] } } },
        { $set: {
          pinLockedUntil: { $cond: [{ $gte: ["$pinFailedAttempts", 5] }, lockUntil, null] },
          pinFailedAttempts: { $cond: [{ $gte: ["$pinFailedAttempts", 5] }, 0, "$pinFailedAttempts"] }
        } }
      ], { new: true }
    );
    const locked = !updated || Boolean(updated.pinLockedUntil && updated.pinLockedUntil > now);
    return NextResponse.json({ message: locked ? "PIN locked. Sign in again with your password." : "Incorrect PIN." }, { status: locked ? 423 : 401 });
  }
  const pinUnlockedUntil = new Date(Date.now() + PIN_UNLOCK_MINUTES * 60_000);
  await Promise.all([
    UserModel.updateOne({ _id: user._id }, { $set: { pinFailedAttempts: 0, pinLockedUntil: null } }),
    UserSessionModel.updateOne({ _id: auth.context.sessionId, userId: user._id, expiresAt: { $gt: new Date() }, revokedAt: null }, { $set: { pinUnlockedUntil } })
  ]);
  return NextResponse.json({ ok: true });
}
