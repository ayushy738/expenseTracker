import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { digestToken } from "@/lib/auth-crypto";
import { UserSessionModel } from "@/models/UserSession";

export const SESSION_COOKIE = "finance_session";
export const CSRF_COOKIE = "finance_csrf";
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthContext = { userId: string; sessionId: string; pinUnlockedUntil: Date };
type AuthResult = { context: AuthContext; response: null } | { context: null; response: NextResponse };

type SessionState = "session_valid" | "session_token_not_found" | "session_expired" | "session_revoked";
function diagnoseSession(state: SessionState | "no_session_cookie" | "pin_locked") {
  // Deliberately exclude token, cookie, user, route, and financial values.
  console.info("auth_session_state", { state });
}

async function findSessionForToken(token: string) {
  return UserSessionModel.findOne({ tokenHash: digestToken(token) });
}

export async function getSessionContext(options: { allowPinLocked?: boolean } = {}): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) { diagnoseSession("no_session_cookie"); return null; }
  await connectToDatabase();
  const session = await findSessionForToken(token);
  if (!session) { diagnoseSession("session_token_not_found"); return null; }
  if (session.revokedAt) { diagnoseSession("session_revoked"); return null; }
  if (session.expiresAt <= new Date()) { diagnoseSession("session_expired"); return null; }
  const isPinLocked = session.pinUnlockedUntil <= new Date();
  diagnoseSession(isPinLocked ? "pin_locked" : "session_valid");
  if (!options.allowPinLocked && isPinLocked) return null;
  return { userId: String(session.userId), sessionId: String(session._id), pinUnlockedUntil: session.pinUnlockedUntil };
}

export function readRequestCookie(request: Request, name: string) {
  return request.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function requireUser(options: { allowPinLocked?: boolean; csrf?: boolean } = {}, request?: Request): Promise<AuthResult> {
  let context: AuthContext | null;
  let pinLocked = false;
  if (request) {
    const token = readRequestCookie(request, SESSION_COOKIE);
    if (!token) { diagnoseSession("no_session_cookie"); context = null; }
    else {
      await connectToDatabase();
      const session = await findSessionForToken(token);
      if (!session) { diagnoseSession("session_token_not_found"); context = null; }
      else if (session.revokedAt) { diagnoseSession("session_revoked"); context = null; }
      else if (session.expiresAt <= new Date()) { diagnoseSession("session_expired"); context = null; }
      else {
        context = { userId: String(session.userId), sessionId: String(session._id), pinUnlockedUntil: session.pinUnlockedUntil };
        const isPinLocked = context.pinUnlockedUntil <= new Date();
        diagnoseSession(isPinLocked ? "pin_locked" : "session_valid");
        if (!options.allowPinLocked && isPinLocked) { context = null; pinLocked = true; }
      }
    }
  } else {
    context = await getSessionContext({ allowPinLocked: true });
    if (context && !options.allowPinLocked && context.pinUnlockedUntil <= new Date()) { diagnoseSession("pin_locked"); context = null; pinLocked = true; }
  }
  if (!context) return { context: null, response: NextResponse.json({ message: pinLocked ? "Unlock this session with your PIN." : "Authentication required." }, { status: pinLocked ? 423 : 401 }) };
  if (options.csrf) {
    const h = request?.headers;
    const origin = h?.get("origin");
    const host = h?.get("x-forwarded-host") ?? h?.get("host");
    const proto = h?.get("x-forwarded-proto") ?? (request ? new URL(request.url).protocol.replace(":", "") : "https");
    const expected = host ? `${proto}://${host}` : request ? new URL(request.url).origin : null;
    const csrfCookie = request ? readRequestCookie(request, CSRF_COOKIE) : (await cookies()).get(CSRF_COOKIE)?.value;
    let csrfHeader = h?.get("x-csrf-token");
    if (!csrfHeader && request && /^(application\/x-www-form-urlencoded|multipart\/form-data)/i.test(h?.get("content-type") ?? "")) {
      csrfHeader = String((await request.clone().formData().catch(() => new FormData())).get("csrfToken") ?? "");
    }
    if (!origin || origin !== expected || !csrfCookie || csrfCookie !== csrfHeader) {
      return { context: null, response: NextResponse.json({ message: "Invalid request origin or CSRF token." }, { status: 403 }) };
    }
  }
  return { context, response: null };
}

export function setSessionCookies(response: NextResponse, token: string, csrf: string, expiresAt: Date) {
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "strict", path: "/", expires: expiresAt });
  response.cookies.set(CSRF_COOKIE, csrf, { httpOnly: false, secure, sameSite: "strict", path: "/", expires: expiresAt });
}

export function clearSessionCookies(response: NextResponse) {
  const secure = process.env.NODE_ENV === "production";
  for (const name of [SESSION_COOKIE, CSRF_COOKIE]) response.cookies.set(name, "", { httpOnly: name === SESSION_COOKIE, secure, sameSite: "strict", path: "/", maxAge: 0 });
}
