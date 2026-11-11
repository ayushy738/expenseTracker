import { createHash } from "node:crypto";

export function transactionFingerprint(input: {
  amount: number;
  transactionType: string;
  bank?: string;
  merchant?: string;
  reference?: string;
  timestamp: Date;
  testRunId?: string;
}) {
  const bank = (input.bank ?? "").trim().toLowerCase();
  const reference = (input.reference ?? "").replace(/\s/g, "").toLowerCase();
  const merchant = (input.merchant ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const amountPaise = Math.round(input.amount * 100);
  const identity = reference
    ? [bank, input.transactionType, reference, amountPaise].join("|")
    : [bank, input.transactionType, amountPaise, merchant, input.timestamp.toISOString()].join("|");
  const namespacedIdentity = input.testRunId ? `e2e:${input.testRunId}|${identity}` : identity;
  return createHash("sha256").update(namespacedIdentity).digest("hex");
}
