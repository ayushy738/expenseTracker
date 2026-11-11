export type E2eEnvironment = {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  E2E_TEST_MODE?: string;
  E2E_TEST_USER_EMAIL?: string;
  MONGODB_DB?: string;
  MONGODB_URI?: string;
};

const LOCAL_DATABASE_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Fails closed unless the backend is development-only and points at a local _e2e database. */
export function isE2eTestModeEnabled(env: E2eEnvironment = process.env): boolean {
  if (env.NODE_ENV !== "development" || env.VERCEL_ENV === "production" || env.E2E_TEST_MODE !== "true") return false;
  if (!env.MONGODB_DB?.trim().toLowerCase().endsWith("_e2e")) return false;
  if (!env.E2E_TEST_USER_EMAIL?.trim()) return false;
  try {
    const uri = new URL(env.MONGODB_URI ?? "");
    return uri.protocol === "mongodb:" && LOCAL_DATABASE_HOSTS.has(uri.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function isE2eTestRequest(request: Request): boolean {
  return request.headers.get("x-deposit-flow-e2e") === "1";
}

export function isConfiguredE2eEmail(email: string | undefined, env: E2eEnvironment = process.env): boolean {
  const configured = env.E2E_TEST_USER_EMAIL?.trim().toLowerCase();
  return Boolean(configured && email?.trim().toLowerCase() === configured);
}
