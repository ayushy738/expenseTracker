import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb);
export const SESSION_DAYS = 30;
export const PIN_UNLOCK_MINUTES = 30;
const KEY_LENGTH = 64;

export async function hashSecret(secret: string, pepper = "") {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(`${secret}${pepper}`, salt, KEY_LENGTH) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifySecret(secret: string, encoded: string, pepper = "") {
  const [format, salt, expectedHex] = encoded.split("$");
  if (format !== "scrypt" || !salt || !expectedHex || !/^[a-f0-9]{128}$/i.test(expectedHex)) return false;
  const actual = await scrypt(`${secret}${pepper}`, salt, KEY_LENGTH) as Buffer;
  return timingSafeEqual(actual, Buffer.from(expectedHex, "hex"));
}

export function createOpaqueToken() { return randomBytes(32).toString("base64url"); }
export function digestToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function pinPepper() {
  const value = process.env.PIN_PEPPER;
  if (!value || value.length < 32) throw new Error("PIN_PEPPER must be at least 32 characters.");
  return value;
}
