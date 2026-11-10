import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { hashSecret, createOpaqueToken, digestToken } from "@/lib/auth-crypto";
import { requestAddress, takeAuthAttempt } from "@/lib/auth-throttle";
import { SESSION_MS, setSessionCookies } from "@/lib/auth";
import { UserModel } from "@/models/User";
import { UserSessionModel } from "@/models/UserSession";
import { AuthThrottleModel } from "@/models/AuthThrottle";
import { readJsonLimited } from "@/lib/request-body";

const schema = z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().email().max(254), password: z.string().min(8).max(256), confirmPassword: z.string().min(8).max(256) }).refine(x => x.password === x.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match." });
function sameOrigin(request: Request) { const origin = request.headers.get("origin"); return !!origin && origin === new URL(request.url).origin; }

function safeErrorText(value: string) {
  return value
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'`]+/gi, "mongodb://[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/scrypt\$[^\s"'`]+/gi, "[redacted-password-verifier]")
    .replace(/(passwordHash\s*[:=]\s*)[^,}\s]+/gi, "$1[redacted]");
}

function logRegistrationFailure(stage: string, error: unknown) {
  const err = error instanceof Error ? error : new Error(String(error));
  const mongoError = error as { code?: unknown; keyPattern?: Record<string, unknown> } | null;
  const details = {
    stage,
    name: err.name,
    code: mongoError && typeof mongoError.code === "number" ? mongoError.code : undefined,
    keyPattern: mongoError?.keyPattern,
    message: safeErrorText(err.message),
    ...(process.env.NODE_ENV === "development" && err.stack ? { stack: safeErrorText(err.stack) } : {})
  };
  console.error("[auth/register] Registration failed", details);
}

function isEmailDuplicate(error: unknown) {
  const candidate = error as { code?: unknown; keyPattern?: Record<string, unknown>; message?: string } | null;
  return candidate?.code === 11000 && (candidate.keyPattern?.email === 1 || candidate.message?.includes("email_1") === true);
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ message: "Invalid request origin." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ message: "JSON is required." }, { status: 415 });
  const input = await readJsonLimited(request, 8192);
  const parsed = schema.safeParse(input.ok ? input.value : null);
  if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid registration." }, { status: 400 });
  let stage = "database-connection";
  try {
    await connectToDatabase();
    stage = "model-index-initialization";
    await Promise.all([UserModel.init(), UserSessionModel.init(), AuthThrottleModel.init()]);
    const email = parsed.data.email.toLowerCase();
    const ip = requestAddress(request.headers);
    stage = "registration-throttle";
    if (!await takeAuthAttempt("register", ip) || !await takeAuthAttempt("register", `${ip}:${email}`)) return NextResponse.json({ message: "Too many registration attempts. Try again later." }, { status: 429 });
    stage = "password-hashing";
    const passwordHash = await hashSecret(parsed.data.password);
    stage = "user-creation";
    const user = await UserModel.create({ name: parsed.data.name, email, passwordHash });
    const token = createOpaqueToken(); const csrf = randomBytes(32).toString("base64url"); const expiresAt = new Date(Date.now() + SESSION_MS);
    stage = "session-creation";
    await UserSessionModel.create({ userId: user._id, tokenHash: digestToken(token), expiresAt, pinUnlockedUntil: expiresAt });
    const response = NextResponse.json({ user: { id: String(user._id), name: user.name, email: user.email } }, { status: 201 });
    setSessionCookies(response, token, csrf, expiresAt); return response;
  } catch (error) {
    logRegistrationFailure(stage, error);
    if (stage === "user-creation" && isEmailDuplicate(error)) return NextResponse.json({ message: "An account with this email already exists." }, { status: 409 });
    return NextResponse.json({ message: "Registration failed." }, { status: 500 });
  }
}
