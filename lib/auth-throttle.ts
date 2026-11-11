import { createHash } from "node:crypto";
import { AuthThrottleModel } from "@/models/AuthThrottle";

function makeKey(scope: string, input: string) { return createHash("sha256").update(`${scope}:${input}`).digest("hex"); }

export type AuthThrottleScope = "login" | "register" | "pairing-init" | "pairing-claim";

export async function takeAuthAttempt(scope: AuthThrottleScope, identity: string, now = new Date()) {
  const key = makeKey(scope, identity);
  const max = scope === "login" ? 10 : scope === "pairing-claim" ? 10 : 5;
  const windowMs = 15 * 60 * 1000;
  const blockedMs = 15 * 60 * 1000;
  const cutoff = new Date(now.getTime() - windowMs);
  // Compare-and-set the count so concurrent serverless instances cannot all
  // pass a stale read of the same attempt count.
  for (let retry = 0; retry < 12; retry += 1) {
    const row = await AuthThrottleModel.findOne({ key });
    if (row?.blockedUntil && row.blockedUntil > now) return false;
    if (!row || row.windowStartedAt <= cutoff) {
      if (!row) {
        try {
          await AuthThrottleModel.create({ key, windowStartedAt: now, attempts: 1, blockedUntil: null, expiresAt: new Date(now.getTime() + windowMs + blockedMs) });
          return true;
        } catch (error) {
          if ((error as { code?: number }).code === 11000) continue;
          throw error;
        }
      }
      const reset = await AuthThrottleModel.updateOne({ key, attempts: row.attempts, windowStartedAt: row.windowStartedAt }, { $set: { windowStartedAt: now, attempts: 1, blockedUntil: null, expiresAt: new Date(now.getTime() + windowMs + blockedMs) } });
      if (reset.modifiedCount) return true;
      continue;
    }
    const attempts = row.attempts + 1;
    const updated = await AuthThrottleModel.updateOne({ key, attempts: row.attempts, windowStartedAt: row.windowStartedAt, $or: [{ blockedUntil: null }, { blockedUntil: { $lte: now } }, { blockedUntil: { $exists: false } }] }, { $set: { attempts, blockedUntil: attempts >= max ? new Date(now.getTime() + blockedMs) : null, expiresAt: new Date(now.getTime() + blockedMs) } });
    if (updated.modifiedCount) return attempts <= max;
  }
  return false;
}

export function requestAddress(headers: Headers) { return headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers.get("x-real-ip") ?? "unknown"; }
