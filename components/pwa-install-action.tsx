"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "deposit-flow:pwa-install-dismissed";

export function PwaInstallAction() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [manualHelp, setManualHelp] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    try { setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "1"); } catch { /* Install help remains available. */ }
    if (window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone)) {
      setInstalled(true);
    }
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      try { if (window.localStorage.getItem(DISMISSED_KEY) === "1") return; } catch { /* User can still install manually. */ }
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setManualHelp(false); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!promptEvent) { setManualHelp((current) => !current); return; }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    setPromptEvent(null);
    if (choice.outcome === "dismissed") {
      setDismissed(true);
      try { window.localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* No repeated automatic prompts are made. */ }
    }
  }

  if (installed) return <p role="status" className="text-sm text-muted-foreground">Deposit Flow is installed on this device.</p>;
  if (dismissed && !manualHelp) return <Button type="button" variant="outline" onClick={() => setManualHelp(true)}>Install instructions</Button>;

  return <div className="grid gap-2">
    <Button type="button" variant="outline" onClick={() => void install()}><Download className="h-4 w-4" />{promptEvent ? "Install app" : "How to install"}</Button>
    {manualHelp ? <div className="rounded-xl border bg-background/50 p-3 text-sm" role="status"><p className="font-medium">Install from your browser</p><p className="mt-1 text-muted-foreground">In Chrome on Android, open the ⋮ menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. The browser will confirm whether installation is available.</p><button className="mt-2 text-primary underline" onClick={() => setManualHelp(false)}>Close</button></div> : null}
  </div>;
}
