"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/client-api";
import { acquireSubmission, amountExceedsDeposit, eligibleDeposits, initialDepositId, localDateInputValue, parseRupeesToPaise, paiseToApiAmount, paiseToCurrency } from "@/lib/quick-add";
import { categories, type Deposit, type ExpenseCategory } from "@/types/finance";

type ExpenseResult = { amount: number; depositId: string; category: ExpenseCategory; description?: string };
type LoadState = "loading" | "ready" | "error" | "signed-out" | "pin-locked";

export function QuickAddExpense({ userId }: { userId: string }) {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [amount, setAmount] = useState("");
  const [selectedDepositId, setSelectedDepositId] = useState("");
  const [depositQuery, setDepositQuery] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("Food");
  const [description, setDescription] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<ExpenseResult | null>(null);
  const [updatedRemaining, setUpdatedRemaining] = useState<number | null>(null);
  const submissionLock = useRef(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const eligible = useMemo(() => eligibleDeposits(deposits), [deposits]);
  const selectedDeposit = eligible.find((deposit) => deposit.depositId === selectedDepositId);
  const amountPaise = parseRupeesToPaise(amount);
  const exceedsBalance = Boolean(selectedDeposit && amountPaise !== null && amountExceedsDeposit(amountPaise, selectedDeposit.remainingAmount));
  const searchableDeposits = eligible.filter((deposit) =>
    `${deposit.depositId} ${deposit.source} ${deposit.description ?? ""}`.toLocaleLowerCase().includes(depositQuery.trim().toLocaleLowerCase())
  );

  useEffect(() => {
    let cancelled = false;
    setExpenseDate(localDateInputValue());
    async function loadDeposits() {
      try {
        const response = await apiFetch("/api/deposits");
        if (response.status === 401) { if (!cancelled) setLoadState("signed-out"); return; }
        if (response.status === 423) { if (!cancelled) setLoadState("pin-locked"); return; }
        if (!response.ok) throw new Error("Deposits could not be loaded. Check your connection and try again.");
        const result = await response.json() as Deposit[];
        if (cancelled) return;
        const usable = eligibleDeposits(result);
        let remembered: string | null = null;
        try {
          const key = `deposit-flow:last-deposit:${userId}`;
          remembered = window.localStorage.getItem(key);
          if (remembered && !usable.some((deposit) => deposit.depositId === remembered)) {
            window.localStorage.removeItem(key);
            remembered = null;
          }
        } catch { /* Browser storage can be unavailable; deposit selection still works. */ }
        setDeposits(result);
        setSelectedDepositId(initialDepositId(result, remembered));
        setLoadState("ready");
      } catch {
        if (!cancelled) setLoadState("error");
      }
    }
    void loadDeposits();
    return () => { cancelled = true; };
  }, [userId]);

  async function saveExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!acquireSubmission(submissionLock)) return;
    setSubmitting(true);
    setError("");
    try {
      if (amountPaise === null) throw new Error("Enter an amount greater than ₹0 with no more than two decimal places.");
      if (!selectedDeposit) throw new Error("Choose a deposit with money remaining.");
      if (exceedsBalance) throw new Error("This deposit does not have enough remaining balance.");

      // Noon local time avoids shifting the selected calendar date across time zones.
      if (!expenseDate) throw new Error("Choose a valid expense date.");
      const chosenDate = new Date(`${expenseDate}T12:00:00`);
      if (!Number.isFinite(chosenDate.getTime())) throw new Error("Choose a valid expense date.");
      const response = await apiFetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: paiseToApiAmount(amountPaise),
          depositId: selectedDeposit.depositId,
          category,
          description: description.trim(),
          date: chosenDate.toISOString()
        })
      });

      if (response.status === 401) throw new Error("Your session expired. Sign in again to save this expense.");
      if (response.status === 423) throw new Error("Your session is locked. Unlock it with your PIN, then try again.");
      const responseBody = await response.json().catch(() => ({})) as ExpenseResult & { message?: string };
      if (response.status === 403) throw new Error("Your session security check expired. Refresh this page and try again.");
      if (!response.ok) {
        const message = responseBody.message ?? "The expense could not be saved. Please try again.";
        if (response.status === 400 && /remaining amount|exceeds/i.test(message)) {
          throw new Error("This deposit no longer has enough remaining balance. Choose another deposit or lower the amount.");
        }
        if (response.status === 404) throw new Error("That deposit is no longer available. Choose another deposit.");
        throw new Error(message);
      }

      const created = responseBody;
      try { window.localStorage.setItem(`deposit-flow:last-deposit:${userId}`, selectedDeposit.depositId); } catch { /* Preference is optional. */ }
      setSaved(created);
      setUpdatedRemaining(null);
      try {
        const refreshed = await apiFetch("/api/deposits");
        if (refreshed.ok) {
          const currentDeposits = await refreshed.json() as Deposit[];
          const currentDeposit = currentDeposits.find((deposit) => deposit.depositId === created.depositId);
          if (currentDeposit) {
            setDeposits(currentDeposits);
            setUpdatedRemaining(currentDeposit.remainingAmount);
          }
        }
      } catch { /* Expense is saved; do not imply the accounting write failed if refresh fails. */ }
    } catch (caught) {
      setError(caught instanceof TypeError ? "Could not reach the finance service. Check your internet connection and try again. No expense was queued offline." : caught instanceof Error && caught.message ? caught.message : "Could not reach the finance service. Check your connection and try again.");
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  }

  function addAnother() {
    setSaved(null);
    setUpdatedRemaining(null);
    setAmount("");
    setDescription("");
    setCategory("Food");
    setExpenseDate(localDateInputValue());
    setError("");
    requestAnimationFrame(() => amountRef.current?.focus());
  }

  if (loadState === "loading") return <Card><CardContent className="p-6 text-sm text-muted-foreground" role="status">Loading your available deposits…</CardContent></Card>;
  if (loadState === "signed-out" || loadState === "pin-locked") {
    return <Card><CardContent className="grid gap-3 p-6"><p role="alert">{loadState === "signed-out" ? "Your session has expired." : "Your session is locked."}</p><Button asChild><Link href={loadState === "signed-out" ? "/login" : "/unlock"}>{loadState === "signed-out" ? "Sign in" : "Unlock with PIN"}</Link></Button></CardContent></Card>;
  }
  if (loadState === "error") return <Card><CardContent className="grid gap-3 p-6"><p role="alert">Could not load deposits. Check your connection and try again.</p><Button variant="outline" onClick={() => window.location.reload()}>Try again</Button></CardContent></Card>;
  if (eligible.length === 0) return <Card><CardContent className="grid gap-4 p-6"><p className="font-medium">{deposits.length === 0 ? "Add a deposit before recording an expense." : "No deposit has money remaining."}</p><p className="text-sm text-muted-foreground">Each expense is charged to one deposit, so there is no general balance to spend from.</p><Button asChild><Link href="/deposits">{deposits.length === 0 ? "Add a deposit" : "View deposits"}</Link></Button></CardContent></Card>;

  if (saved) {
    const savedDeposit = deposits.find((deposit) => deposit.depositId === saved.depositId);
    return <Card className="mx-auto w-full max-w-xl"><CardHeader><div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary"><Check className="h-6 w-6" aria-hidden="true" /></div><CardTitle className="text-xl">Expense saved</CardTitle><CardDescription>Your expense was linked to the selected deposit.</CardDescription></CardHeader><CardContent className="grid gap-4">
      <div className="rounded-2xl border bg-background/50 p-4"><p className="text-3xl font-bold tabular-nums">{paiseToCurrency(Math.round(saved.amount * 100))}</p><p className="mt-1 text-sm">{saved.category}{saved.description ? ` · ${saved.description}` : ""}</p><p className="mt-3 text-sm text-muted-foreground">{savedDeposit?.source ?? "Deposit"} · {saved.depositId}</p>{updatedRemaining !== null ? <p className="mt-1 text-sm font-medium">Remaining: {paiseToCurrency(Math.round(updatedRemaining * 100))}</p> : <p className="mt-1 text-sm text-muted-foreground">Saved successfully. The latest balance will appear when deposits refresh.</p>}</div>
      <div className="grid grid-cols-2 gap-3"><Button className="h-12" onClick={addAnother}>Add another</Button><Button className="h-12" variant="outline" asChild><Link href="/expenses">Done</Link></Button></div>
    </CardContent></Card>;
  }

  return <div className="mx-auto w-full max-w-xl">
    <div className="mb-4"><Button variant="ghost" size="sm" asChild><Link href="/expenses"><ChevronLeft className="h-4 w-4" />Expenses</Link></Button><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Quick add expense</h1><p className="mt-1 text-sm text-muted-foreground">Record it once. We’ll charge the deposit you choose.</p></div>
    <form onSubmit={(event) => void saveExpense(event)} className="grid gap-4">
      <Card><CardContent className="grid gap-2 p-4 sm:p-5"><Label htmlFor="quick-amount">Amount</Label><div className="flex items-center rounded-2xl border bg-background/60 px-4 focus-within:ring-2 focus-within:ring-ring"><span className="text-3xl font-semibold text-muted-foreground" aria-hidden="true">₹</span><input ref={amountRef} id="quick-amount" name="amount" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" aria-describedby="quick-amount-hint" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-20 min-w-0 flex-1 bg-transparent px-3 text-4xl font-bold tabular-nums outline-none placeholder:text-muted-foreground/50 sm:text-5xl" required /><span className="sr-only" id="quick-amount-hint">Enter rupees and up to two paise digits.</span></div>{amount && amountPaise === null ? <p className="text-sm text-destructive" role="alert">Enter a valid amount using up to two decimal places.</p> : null}</CardContent></Card>

      <Card><CardContent className="grid gap-3 p-4 sm:p-5"><div className="flex items-center justify-between gap-2"><Label>Deposit</Label>{selectedDeposit ? <span className="text-xs font-medium text-muted-foreground">{paiseToCurrency(Math.round(selectedDeposit.remainingAmount * 100))} left</span> : null}</div>
        {eligible.length > 1 ? <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input aria-label="Search eligible deposits" placeholder="Search deposits" value={depositQuery} onChange={(event) => setDepositQuery(event.target.value)} className="pl-9" /></div> : null}
        <div className="grid max-h-52 gap-2 overflow-y-auto" role="group" aria-label="Choose a deposit">{searchableDeposits.map((deposit) => {
          const active = selectedDepositId === deposit.depositId;
          return <button key={deposit.depositId} type="button" aria-pressed={active} onClick={() => { setSelectedDepositId(deposit.depositId); setDepositQuery(""); }} className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${active ? "border-primary bg-primary/8 ring-1 ring-primary" : "bg-background/50 hover:bg-muted/60"}`}><span className="min-w-0"><span className="block truncate text-sm font-semibold">{deposit.source}</span><span className="block text-xs text-muted-foreground">{deposit.depositId}</span></span><span className="shrink-0 text-right text-sm font-medium tabular-nums">{paiseToCurrency(Math.round(deposit.remainingAmount * 100))}<span className="block text-xs text-muted-foreground">remaining</span></span></button>;
        })}{searchableDeposits.length === 0 ? <p className="py-3 text-sm text-muted-foreground">No matching eligible deposits.</p> : null}</div>
      </CardContent></Card>

      <Card><CardContent className="grid gap-3 p-4 sm:p-5"><Label>Category</Label><div className="grid grid-cols-3 gap-2">{categories.map((item) => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} className={`min-h-11 rounded-xl border px-2 text-sm font-medium ${category === item ? "border-primary bg-primary/10 text-primary" : "bg-background/50 hover:bg-muted/60"}`}>{item}</button>)}</div></CardContent></Card>

      <details className="rounded-2xl border bg-background/40 px-4 py-3"><summary className="cursor-pointer text-sm font-medium">Date and note <span className="text-muted-foreground">· optional</span></summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="grid gap-1.5"><Label htmlFor="quick-date">Expense date</Label><Input id="quick-date" type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} /></div><div className="grid gap-1.5"><Label htmlFor="quick-note">Note</Label><Input id="quick-note" maxLength={240} placeholder="Optional" value={description} onChange={(event) => setDescription(event.target.value)} /></div></div></details>

      {exceedsBalance ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">This deposit does not have enough remaining balance.</p> : null}
      {error ? <div className="grid gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert"><p>{error}</p>{error.includes("Sign in again") ? <Link className="font-semibold underline" href="/login">Sign in</Link> : error.includes("Unlock it") ? <Link className="font-semibold underline" href="/unlock">Unlock session</Link> : null}</div> : null}
      <Button type="submit" disabled={submitting || amountPaise === null || !selectedDeposit || exceedsBalance} className="h-14 w-full text-base">{submitting ? "Saving…" : "Save expense"}</Button>
      <p className="text-center text-xs text-muted-foreground">Saved to the selected deposit after the server confirms the balance.</p>
    </form>
  </div>;
}
