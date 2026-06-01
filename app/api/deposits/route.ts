import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { applySavingsToFund, getNextDepositId, normalizeDepositAmounts } from "@/lib/finance";
import { DepositModel } from "@/models/Deposit";

const DepositSchema = z.object({
  amount: z.coerce.number().positive(),
  source: z.string().min(1),
  description: z.string().optional().default(""),
  savingsAmount: z.coerce.number().min(0).default(0),
  savingsFundId: z.string().optional(),
  createdAt: z.coerce.date().optional()
});

export async function GET() {
  await connectToDatabase();
  const deposits = await DepositModel.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json(deposits);
}

export async function POST(request: Request) {
  await connectToDatabase();
  const payload = DepositSchema.parse(await request.json());

  if (payload.savingsAmount > payload.amount) {
    return NextResponse.json({ message: "Savings cannot be greater than deposit amount." }, { status: 400 });
  }

  const depositId = await getNextDepositId();
  const amounts = normalizeDepositAmounts(payload.amount, payload.savingsAmount);
  const deposit = await DepositModel.create({
    ...payload,
    depositId,
    spentAmount: 0,
    ...amounts,
    createdAt: payload.createdAt ?? new Date()
  });

  await applySavingsToFund(payload.savingsFundId, payload.savingsAmount);
  return NextResponse.json(deposit, { status: 201 });
}
