import { z } from "zod";

export const TransactionIngestionSchema = z.object({
  amount: z.number().positive().max(1_000_000_000).refine((amount) => Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-7, "Amount must use at most two decimal places."),
  transactionType: z.enum(["DEBIT", "CREDIT"]),
  bank: z.string().trim().max(100).optional().default(""),
  merchant: z.string().trim().max(160).optional().default(""),
  reference: z.string().trim().max(120).optional().default(""),
  timestamp: z.coerce.date()
}).strict();
