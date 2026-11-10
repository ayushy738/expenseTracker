import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { hashSecret, verifySecret } from "@/lib/auth-crypto";
import { UserModel } from "@/models/User";
import { UserSessionModel } from "@/models/UserSession";

const schema = z.object({ currentPassword: z.string().min(1).max(256), password: z.string().min(8).max(256), confirmPassword: z.string().min(8).max(256) }).refine(x => x.password === x.confirmPassword);
export async function PUT(request: Request) {
  const auth = await requireUser({ csrf: true }, request); if (auth.response) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Check the password fields; new passwords must match and contain at least 8 characters." }, { status: 400 });
  const user = await UserModel.findById(auth.context.userId).select("+passwordHash");
  if (!user || !await verifySecret(parsed.data.currentPassword, user.passwordHash)) return NextResponse.json({ message: "Current password is incorrect." }, { status: 401 });
  user.passwordHash = await hashSecret(parsed.data.password); await user.save();
  await UserSessionModel.updateMany({ userId: user._id, _id: { $ne: auth.context.sessionId }, revokedAt: null }, { $set: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
