import { createHash, randomBytes } from "node:crypto";

export function hashDeviceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createDeviceToken() {
  return randomBytes(32).toString("base64url");
}
