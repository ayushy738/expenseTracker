"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    const update = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        // Ask the browser to check for the current worker when an installed app
        // opens or returns to the foreground. The worker's allowlist ensures
        // authenticated responses are never cached during this update.
        await registration.update();
      } catch {
        // PWA enhancement is optional; the authenticated website remains usable without it.
      }
    };
    void update();
    const onVisible = () => { if (!cancelled && document.visibilityState === "visible") void update(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
