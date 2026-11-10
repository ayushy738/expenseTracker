import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { normalizeDepositAmounts, reverseSavingsFromFund, applySavingsToFund } from "@/lib/finance";
import { DepositModel } from "@/models/Deposit";
import { ExpenseModel } from "@/models/Expense";
import { BankTransactionModel } from "@/models/BankTransaction";
import { SavingsFundModel } from "@/models/SavingsFund";
import mongoose from "mongoose";
import { requireUser } from "@/lib/auth";

const UpdateDepositSchema = z.object({
  amount: z.coerce.number().positive().optional(),
  source: z.string().min(1).optional(),
  description: z.string().optional(),
  savingsAmount: z.coerce.number().min(0).optional(),
  savingsFundId: z.string().optional(),
  createdAt: z.coerce.date().optional()
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser({}, _); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const { id } = await params;
  const deposit = await DepositModel.findOne({ userId, depositId: id }).lean();
  if (!deposit) return NextResponse.json({ message: "Deposit not found." }, { status: 404 });
  const expenses = await ExpenseModel.find({ userId, depositId: id }).sort({ date: -1 }).lean();
  return NextResponse.json({ deposit, expenses });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser({ csrf: true }, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const { id } = await params;
  const payload = UpdateDepositSchema.parse(await request.json());
  const session = await mongoose.startSession();
  let updated: unknown;
  let failure: { status: number; message: string } | undefined;
  try {
    await session.withTransaction(async () => {
      const deposit = await DepositModel.findOne({ userId, depositId: id }).session(session);
      if (!deposit) { failure = { status: 404, message: "Deposit not found." }; throw new Error("DEPOSIT_ABORT"); }
      const nextAmount = payload.amount ?? deposit.amount;
      const nextSavings = payload.savingsAmount ?? deposit.savingsAmount;
      if (nextSavings > nextAmount) { failure = { status: 400, message: "Savings cannot be greater than deposit amount." }; throw new Error("DEPOSIT_ABORT"); }

      if (payload.savingsAmount !== undefined || payload.savingsFundId !== undefined) {
        const previousFundId = String(deposit.savingsFundId || "");
        const nextFundId = payload.savingsFundId ?? previousFundId;
        if (nextFundId && !await SavingsFundModel.exists({ _id: nextFundId, userId }).session(session)) { failure = { status: 404, message: "Selected savings fund does not exist." }; throw new Error("DEPOSIT_ABORT"); }
        await reverseSavingsFromFund(userId, previousFundId, deposit.savingsAmount, session);
        await applySavingsToFund(userId, nextFundId, nextSavings, session);
      }

      Object.assign(deposit, payload);
      const amounts = normalizeDepositAmounts(nextAmount, nextSavings, deposit.spentAmount);
      deposit.spendableAmount = amounts.spendableAmount;
      deposit.remainingAmount = amounts.remainingAmount;
      await deposit.save({ session });
      updated = deposit;
    });
  } catch (error) {
    if (failure) return NextResponse.json({ message: failure.message }, { status: failure.status });
    throw error;
  } finally {
    await session.endSession();
  }
  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser({ csrf: true }, _); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const { id } = await params;
  await BankTransactionModel.init();
  const session = await mongoose.startSession();
  let notFound = false;
  try {
    await session.withTransaction(async () => {
      const deposit = await DepositModel.findOne({ userId, depositId: id }).session(session);
      if (!deposit) { notFound = true; return; }
      const importedTransactions = await BankTransactionModel.find({ userId, depositId: id, status: "CONFIRMED" }).session(session);
      for (const transaction of importedTransactions) {
        transaction.history.push({
          action: "REVERSED", at: new Date(), reason: "Deposit deleted",
          snapshot: { amount: transaction.amount, category: transaction.category, merchant: transaction.merchant, timestamp: transaction.timestamp, depositId: id, expenseId: transaction.expenseId }
        });
        transaction.status = "REVERSED";
        transaction.expenseId = undefined;
        await transaction.save({ session });
      }
      await ExpenseModel.deleteMany({ userId, depositId: id }, { session });
      await DepositModel.deleteOne({ _id: deposit._id, userId }, { session });
      await reverseSavingsFromFund(userId, String(deposit.savingsFundId || ""), deposit.savingsAmount, session);
    });
  } finally {
    await session.endSession();
  }
  if (notFound) return NextResponse.json({ message: "Deposit not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
