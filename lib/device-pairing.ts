import { createHash, randomBytes } from "node:crypto";

// 32 symbols make each random byte map uniformly to one character (5 bits).
const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function createPairingCode() {
  return Array.from(randomBytes(10), byte => PAIRING_ALPHABET[byte & 31]).join("");
}

export function normalizePairingCode(value: string) {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

export function hashPairingCode(value: string) {
  return createHash("sha256").update(normalizePairingCode(value)).digest("hex");
}

export function pairingChallengeExpiry(now = new Date()) {
  return new Date(now.getTime() + CHALLENGE_TTL_MS);
}

export const PAIRING_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/;
export const PAIRING_CHALLENGE_TTL_MS = CHALLENGE_TTL_MS;
