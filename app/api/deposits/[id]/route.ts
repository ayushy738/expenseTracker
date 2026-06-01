import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { normalizeDepositAmounts, recalculateDeposit, reverseSavingsFromFund, applySavingsToFund } from "@/lib/finance";
import { DepositModel } from "@/models/Deposit";
import { ExpenseModel } from "@/models/Expense";

const UpdateDepositSchema = z.object({
  amount: z.coerce.number().positive().optional(),
  source: z.string().min(1).optional(),
  description: z.string().optional(),
  savingsAmount: z.coerce.number().min(0).optional(),
  savingsFundId: z.string().optional(),
  createdAt: z.coerce.date().optional()
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectToDatabase();
  const { id } = await params;
  const deposit = await DepositModel.findOne({ depositId: id }).lean();
  if (!deposit) return NextResponse.json({ message: "Deposit not found." }, { status: 404 });
  const expenses = await ExpenseModel.find({ depositId: id }).sort({ date: -1 }).lean();
  return NextResponse.json({ deposit, expenses });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectToDatabase();
  const { id } = await params;
  const payload = UpdateDepositSchema.parse(await request.json());
  const deposit = await DepositModel.findOne({ depositId: id });
  if (!deposit) return NextResponse.json({ message: "Deposit not found." }, { status: 404 });

  const nextAmount = payload.amount ?? deposit.amount;
  const nextSavings = payload.savingsAmount ?? deposit.savingsAmount;
  if (nextSavings > nextAmount) {
    return NextResponse.json({ message: "Savings cannot be greater than deposit amount." }, { status: 400 });
  }

  if (payload.savingsAmount !== undefined || payload.savingsFundId !== undefined) {
    await reverseSavingsFromFund(String(deposit.savingsFundId || ""), deposit.savingsAmount);
    await applySavingsToFund(payload.savingsFundId ?? String(deposit.savingsFundId || ""), nextSavings);
  }

  Object.assign(deposit, payload);
  const amounts = normalizeDepositAmounts(nextAmount, nextSavings, deposit.spentAmount);
  deposit.spendableAmount = amounts.spendableAmount;
  deposit.remainingAmount = amounts.remainingAmount;
  await deposit.save();

  return NextResponse.json(deposit);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectToDatabase();
  const { id } = await params;
  const deposit = await DepositModel.findOneAndDelete({ depositId: id });
  if (!deposit) return NextResponse.json({ message: "Deposit not found." }, { status: 404 });

  await ExpenseModel.deleteMany({ depositId: id });
  await reverseSavingsFromFund(String(deposit.savingsFundId || ""), deposit.savingsAmount);
  return NextResponse.json({ ok: true });
}
