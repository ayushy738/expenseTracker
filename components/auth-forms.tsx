"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function csrf() { return document.cookie.split("; ").find((part) => part.startsWith("finance_csrf="))?.split("=").slice(1).join("=") ?? ""; }
function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), credentials: "same-origin" });
      const body = await response.json(); if (!response.ok) throw new Error(body.message || "Could not authenticate.");
      router.replace("/"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Request failed."); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="grid gap-4">
    {mode === "register" && <label className="grid gap-1 text-sm">Name<input name="name" autoComplete="name" required maxLength={100} className="h-11 rounded-xl border bg-background px-3" /></label>}
    <label className="grid gap-1 text-sm">Email<input name="email" type="email" autoComplete="email" required maxLength={254} className="h-11 rounded-xl border bg-background px-3" /></label>
    <label className="grid gap-1 text-sm">Password<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : 1} maxLength={256} className="h-11 rounded-xl border bg-background px-3" /></label>
    {mode === "register" && <label className="grid gap-1 text-sm">Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={256} className="h-11 rounded-xl border bg-background px-3" /></label>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <button disabled={busy} className="h-11 rounded-xl bg-primary font-semibold text-primary-foreground">{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
    <p className="text-sm text-muted-foreground">{mode === "login" ? <>New here? <Link className="text-primary underline" href="/register">Create an account</Link></> : <>Already registered? <Link className="text-primary underline" href="/login">Sign in</Link></>}</p>
  </form>;
}

export function LoginForm() { return <AuthForm mode="login" />; }
export function RegisterForm() { return <AuthForm mode="register" />; }

export function PinUnlockForm() {
  const [error, setError] = useState(""); const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/pin/unlock", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify({ pin: form.get("pin") }) });
    const body = await response.json(); if (!response.ok) { setError(body.message || "Could not unlock."); return; } router.replace("/"); router.refresh();
  }
  return <form onSubmit={submit} className="grid gap-4"><label className="grid gap-1 text-sm">4-digit PIN<input autoFocus name="pin" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required className="h-12 rounded-xl border bg-background px-3 text-center text-2xl tracking-[0.5em]" /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<button className="h-11 rounded-xl bg-primary font-semibold text-primary-foreground">Unlock</button><button type="button" className="text-sm text-primary underline" onClick={async () => { await fetch("/api/auth/logout", { method: "POST", headers: { "x-csrf-token": csrf() } }); router.replace("/login"); }}>Sign out</button></form>;
}

export function AccountSettings() {
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>, endpoint: string) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = Object.fromEntries(form.entries());
    setNotice("");
    try {
      const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json", "x-csrf-token": csrf() }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(typeof result.message === "string" ? result.message : "Update failed. Please check the fields and try again.");
        return;
      }
      formElement.reset();
      setNotice("Updated successfully.");
    } catch {
      setNotice("Could not save the account change. Please try again.");
    }
  }
  return <div className="grid gap-6 md:grid-cols-2"><form onSubmit={e => submit(e, "/api/auth/password")} className="grid content-start gap-3 rounded-2xl border p-5"><h2 className="font-semibold">Change password</h2><input name="currentPassword" placeholder="Current password" type="password" required className="h-11 rounded-xl border bg-background px-3" /><input name="password" placeholder="New password (8+ characters)" type="password" minLength={8} required className="h-11 rounded-xl border bg-background px-3" /><input name="confirmPassword" placeholder="Confirm new password" type="password" minLength={8} required className="h-11 rounded-xl border bg-background px-3" /><button className="h-10 rounded-xl bg-primary text-primary-foreground">Change password</button></form><form onSubmit={e => submit(e, "/api/auth/pin")} className="grid content-start gap-3 rounded-2xl border p-5"><h2 className="font-semibold">Set or change app PIN</h2><input name="password" placeholder="Confirm password" type="password" required className="h-11 rounded-xl border bg-background px-3" /><input name="pin" aria-label="New four digit PIN" placeholder="4-digit PIN" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} required className="h-11 rounded-xl border bg-background px-3" /><button className="h-10 rounded-xl bg-primary text-primary-foreground">Save PIN</button></form>{notice && <p role="status" className="text-sm">{notice}</p>}</div>;
}
