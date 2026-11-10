import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { createOpaqueToken, digestToken, verifySecret } from "@/lib/auth-crypto";
import { requestAddress, takeAuthAttempt } from "@/lib/auth-throttle";
import { SESSION_MS, setSessionCookies } from "@/lib/auth";
import { UserModel } from "@/models/User";
import { UserSessionModel } from "@/models/UserSession";
import { AuthThrottleModel } from "@/models/AuthThrottle";
import { readJsonLimited } from "@/lib/request-body";

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(256) });
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ message: "JSON is required." }, { status: 415 });
  const input = await readJsonLimited(request, 8192);
  const parsed = schema.safeParse(input.ok ? input.value : null);
  if (!parsed.success) return NextResponse.json({ message: "Invalid email or password." }, { status: 400 });
  try {
    await connectToDatabase();
    await Promise.all([UserModel.init(), UserSessionModel.init(), AuthThrottleModel.init()]);
    const email = parsed.data.email.toLowerCase();
    const ip = requestAddress(request.headers);
    if (!await takeAuthAttempt("login", ip) || !await takeAuthAttempt("login", `${ip}:${email}`)) return NextResponse.json({ message: "Too many login attempts. Try again later." }, { status: 429 });
    const user = await UserModel.findOne({ email }).select("+passwordHash +pinHash");
    if (!user || !await verifySecret(parsed.data.password, user.passwordHash)) return NextResponse.json({ message: "Invalid email or password." }, { status: 401 });
    const now = Date.now(); const token = createOpaqueToken(); const csrf = randomBytes(32).toString("base64url"); const expiresAt = new Date(now + SESSION_MS);
    const pinUnlockedUntil = user.pinHash ? new Date(now + 30 * 60_000) : expiresAt;
    user.pinFailedAttempts = 0; user.pinLockedUntil = null; await user.save();
    await UserSessionModel.create({ userId: user._id, tokenHash: digestToken(token), expiresAt, pinUnlockedUntil });
    const response = NextResponse.json({ user: { id: String(user._id), name: user.name, email: user.email } });
    setSessionCookies(response, token, csrf, expiresAt); return response;
  } catch { return NextResponse.json({ message: "Login service is temporarily unavailable." }, { status: 503 }); }
}
