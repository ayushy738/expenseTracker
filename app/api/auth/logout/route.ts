import { NextResponse } from "next/server";
import { requireUser, clearSessionCookies } from "@/lib/auth";
import { UserSessionModel } from "@/models/UserSession";

export async function POST(request: Request) {
  const auth = await requireUser({ csrf: true, allowPinLocked: true }, request); if (auth.response) return auth.response;
  await UserSessionModel.updateOne({ _id: auth.context.sessionId, userId: auth.context.userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  const response = NextResponse.json({ ok: true }); clearSessionCookies(response); return response;
}
