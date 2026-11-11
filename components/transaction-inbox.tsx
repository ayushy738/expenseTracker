"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BankTransaction, Deposit, categories } from "@/types/finance";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/client-api";

type Device = { _id: string; name: string; status?: "PENDING" | "ACTIVE" | "REVOKED"; lastUsedAt?: string; revokedAt?: string | null; createdAt: string };
type InboxStatus = "PENDING" | "CONFIRMED" | "IGNORED" | "REVERSED";
const inboxStatuses: InboxStatus[] = ["PENDING", "CONFIRMED", "IGNORED", "REVERSED"];

export function TransactionInbox() {
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<InboxStatus>("PENDING");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedDeposits, setSelectedDeposits] = useState<Record<string, string>>({});
  const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pairingCode, setPairingCode] = useState<{ code: string; expiresAt: string } | null>(null);

  const load = useCallback(async () => {
    const [transactionResponse, depositResponse, deviceResponse] = await Promise.all([
      apiFetch(`/api/bank-transactions?status=${status}&page=${page}`), apiFetch("/api/deposits"), apiFetch("/api/devices")
    ]);
    if (![transactionResponse, depositResponse, deviceResponse].every((response) => response.ok)) throw new Error("Unable to load finance data.");
    const transactionPage = await transactionResponse.json();
    if (transactionPage.transactions.length === 0 && page > 1) {
      setPage((current) => Math.max(1, current - 1));
      return;
    }
    setTransactions(transactionPage.transactions);
    setHasMore(transactionPage.hasMore);
    setDeposits(await depositResponse.json());
    setDevices(await deviceResponse.json());
    setMessage("");
  }, [page, status]);

  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);

  async function confirm(transaction: BankTransaction) {
    const depositId = selectedDeposits[transaction._id] ?? deposits.find((deposit) => deposit.remainingAmount >= transaction.amount)?.depositId;
    const category = selectedCategories[transaction._id] ?? "Other";
    if (!depositId) { setMessage("Choose a deposit with enough remaining balance."); return; }
    setBusy(true); setMessage("");
    try {
      const response = await apiFetch(`/api/bank-transactions/${transaction._id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", depositId, category })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Could not confirm transaction.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not confirm transaction."); }
    finally { setBusy(false); }
  }

  async function ignore(transaction: BankTransaction) {
    setBusy(true); setMessage("");
    try {
      const response = await apiFetch(`/api/bank-transactions/${transaction._id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "ignore" })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Could not ignore transaction.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not ignore transaction."); }
    finally { setBusy(false); }
  }

  async function correct(transaction: BankTransaction) {
    const reason = window.prompt("Why are you correcting this confirmed transaction?");
    if (!reason?.trim()) return;
    const amountText = window.prompt("Correct amount", String(transaction.amount));
    if (!amountText) return;
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0) { setMessage("Enter a valid positive amount."); return; }
    const merchant = window.prompt("Correct merchant", transaction.merchant ?? "");
    if (merchant === null) return;
    setBusy(true); setMessage("");
    try {
      const response = await apiFetch(`/api/bank-transactions/${transaction._id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "correct", reason, amount, merchant, category: selectedCategories[transaction._id] ?? transaction.category ?? "Other" })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Could not correct transaction.");
      setStatus("PENDING"); setPage(1); await load();
      setMessage("Original transaction reversed. Corrected transaction is pending review.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not correct transaction."); }
    finally { setBusy(false); }
  }

  async function reverse(transaction: BankTransaction) {
    const reason = window.prompt("Why are you reversing this confirmed transaction?");
    if (!reason?.trim()) return;
    setBusy(true); setMessage("");
    try {
      const response = await apiFetch(`/api/bank-transactions/${transaction._id}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reverse", reason })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Could not reverse transaction.");
      await load();
      setMessage("Transaction reversed and retained in history.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not reverse transaction."); }
    finally { setBusy(false); }
  }

  async function revokeDevice(id: string) {
    setBusy(true);
    try {
      const response = await apiFetch(`/api/devices/${id}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Could not revoke device.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not revoke device."); }
    finally { setBusy(false); }
  }

  async function startPairing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage(""); setPairingCode(null);
    try {
      const response = await apiFetch("/api/devices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Could not create a pairing code.");
      setPairingCode(body);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create a pairing code."); }
    finally { setBusy(false); }
  }

  async function decideDevice(id: string, action: "approve" | "deny") {
    setBusy(true); setMessage("");
    try {
      const response = await apiFetch(`/api/devices/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? `Could not ${action} device.`);
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : `Could not ${action} device.`); }
    finally { setBusy(false); }
  }

  return (
    <section id="inbox" className="mt-8">
      <div className="mb-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">Verification inbox</p>
        <h2 className="mt-1 text-2xl font-bold">Bank transactions</h2>
        <p className="mt-2 text-muted-foreground">Imports stay pending until you assign a deposit and confirm them.</p>
      </div>
      {message ? <p role="alert" className="mb-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-800">{message}</p> : null}
      <div className="mb-4 flex flex-wrap gap-2" aria-label="Transaction status filter">
        {inboxStatuses.map((value) => <Button key={value} size="sm" variant={status === value ? "secondary" : "outline"} onClick={() => { setStatus(value); setPage(1); }}>{value[0] + value.slice(1).toLowerCase()}</Button>)}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <div className="grid content-start gap-3">
          {transactions.length === 0 ? <Card><CardContent className="p-8 text-center text-muted-foreground">No {status.toLowerCase()} transactions.</CardContent></Card> : transactions.map((transaction) => (
            <Card key={transaction._id}>
              <CardHeader className="pb-3"><div className="flex items-start justify-between gap-4"><div><CardTitle>{formatCurrency(transaction.amount)} · {transaction.transactionType}</CardTitle><CardDescription>{transaction.merchant || "Unknown merchant"}{transaction.bank ? ` · ${transaction.bank}` : ""}</CardDescription></div><span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{transaction.status[0] + transaction.status.slice(1).toLowerCase()}</span></div></CardHeader>
              <CardContent className="grid gap-3">
                <p className="text-sm text-muted-foreground">{formatDate(transaction.timestamp)}{transaction.reference ? ` · Ref ${transaction.reference}` : ""}</p>
                {transaction.status === "PENDING" && transaction.transactionType === "DEBIT" ? <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="grid gap-2"><Label htmlFor={`deposit-${transaction._id}`}>Deposit</Label><select id={`deposit-${transaction._id}`} className="h-10 rounded-xl border bg-background px-3 text-sm" value={selectedDeposits[transaction._id] ?? deposits.find((deposit) => deposit.remainingAmount >= transaction.amount)?.depositId ?? ""} onChange={(event) => setSelectedDeposits((current) => ({ ...current, [transaction._id]: event.target.value }))}><option value="">Select a deposit</option>{deposits.filter((deposit) => deposit.remainingAmount >= transaction.amount).map((deposit) => <option key={deposit.depositId} value={deposit.depositId}>{deposit.depositId} · {deposit.source} · {formatCurrency(deposit.remainingAmount)} left</option>)}</select></div>
                    <div className="grid gap-2"><Label htmlFor={`category-${transaction._id}`}>Category</Label><select id={`category-${transaction._id}`} className="h-10 rounded-xl border bg-background px-3 text-sm" value={selectedCategories[transaction._id] ?? "Other"} onChange={(event) => setSelectedCategories((current) => ({ ...current, [transaction._id]: event.target.value }))}>{categories.map((category) => <option key={category}>{category}</option>)}</select></div>
                  </div>
                  <Button disabled={busy} onClick={() => void confirm(transaction)}>Confirm as expense</Button>
                </> : null}
                {transaction.status === "PENDING" && transaction.transactionType === "CREDIT" ? <p className="text-sm text-muted-foreground">Credits and refunds cannot be recorded as expenses. Ignore this item or leave it pending.</p> : null}
                {transaction.status === "CONFIRMED" && transaction.expenseId ? <><p className="text-sm text-muted-foreground">Linked expense: {transaction.expenseId}. Correction creates a pending replacement; reversal removes it from deposit totals.</p><div className="grid max-w-xs gap-2"><Label htmlFor={`correct-category-${transaction._id}`}>Correction category</Label><select id={`correct-category-${transaction._id}`} className="h-10 rounded-xl border bg-background px-3 text-sm" value={selectedCategories[transaction._id] ?? transaction.category ?? "Other"} onChange={(event) => setSelectedCategories((current) => ({ ...current, [transaction._id]: event.target.value }))}>{categories.map((category) => <option key={category}>{category}</option>)}</select></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => void correct(transaction)}>Correct</Button><Button variant="outline" disabled={busy} onClick={() => void reverse(transaction)}>Reverse</Button></div></> : null}
                {transaction.status === "PENDING" ? <Button variant="outline" disabled={busy} onClick={() => void ignore(transaction)}>Ignore</Button> : null}
              </CardContent>
            </Card>
          ))}
          {transactions.length > 0 ? <div className="flex items-center justify-between"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><span className="text-sm text-muted-foreground">Page {page}</span><Button variant="outline" size="sm" disabled={!hasMore} onClick={() => setPage((current) => current + 1)}>Next</Button></div> : null}
        </div>
        <Card className="h-fit">
          <CardHeader><CardTitle>Companion devices</CardTitle><CardDescription>Pair a phone with a one-time code. New devices stay pending until you approve them.</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <form onSubmit={(event) => void startPairing(event)} className="grid gap-2"><Button type="submit" disabled={busy}>Create one-time pairing code</Button><p className="text-xs text-muted-foreground">Enter this code in the companion app. It expires in five minutes and is usable once.</p></form>
            {pairingCode ? <div className="rounded-xl border bg-muted/40 p-4"><p className="text-xs text-muted-foreground">One-time pairing code</p><p className="my-2 font-mono text-2xl font-bold tracking-[0.2em]" aria-label="Pairing code">{pairingCode.code}</p><p className="text-xs text-muted-foreground">Expires {formatDate(pairingCode.expiresAt)}. Keep it private; anyone who uses it first can request pairing.</p></div> : null}
            <div className="grid gap-2">{devices.map((device) => {
              const deviceStatus = device.revokedAt ? "REVOKED" : device.status ?? "ACTIVE";
              return <div key={device._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-medium">{device.name}</p><p className="text-xs text-muted-foreground">{deviceStatus === "PENDING" ? "Approval required" : deviceStatus === "REVOKED" ? "Revoked" : device.lastUsedAt ? `Last used ${formatDate(device.lastUsedAt)}` : "Approved · never connected"}</p></div>{deviceStatus === "PENDING" ? <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => void decideDevice(device._id, "approve")}>Approve</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void decideDevice(device._id, "deny")}>Deny</Button></div> : deviceStatus === "ACTIVE" ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void revokeDevice(device._id)}>Revoke</Button> : null}</div>;
            })}</div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
