import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { recalculateDeposit } from "@/lib/finance";
import { DepositModel } from "@/models/Deposit";
import { ExpenseModel } from "@/models/Expense";
import { categories } from "@/types/finance";
import mongoose from "mongoose";
import { requireUser } from "@/lib/auth";

const UpdateExpenseSchema = z.object({
  amount: z.coerce.number().positive().optional(),
  depositId: z.string().min(1).optional(),
  category: z.enum(categories as [string, ...string[]]).optional(),
  description: z.string().optional(),
  date: z.coerce.date().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser({ csrf: true }, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const { id } = await params;
  const payload = UpdateExpenseSchema.parse(await request.json());
  const session = await mongoose.startSession();
  let updatedExpense: unknown;
  let failure: { status: number; message: string } | undefined;
  try {
    await session.withTransaction(async () => {
      const expense = await ExpenseModel.findOne({ _id: id, userId }).session(session);
      if (!expense) { failure = { status: 404, message: "Expense not found." }; throw new Error("EXPENSE_ABORT"); }
      if (expense.bankTransactionId) { failure = { status: 400, message: "Imported expenses must be corrected from the transaction inbox." }; throw new Error("EXPENSE_ABORT"); }
      const previousDepositId = expense.depositId;
      const nextDepositId = payload.depositId ?? previousDepositId;
      const nextAmount = payload.amount ?? expense.amount;
      if (nextDepositId !== previousDepositId) {
        const nextDeposit = await DepositModel.findOne({ userId, depositId: nextDepositId }).session(session);
        if (!nextDeposit) { failure = { status: 404, message: "Selected deposit does not exist." }; throw new Error("EXPENSE_ABORT"); }
        const reserve = await DepositModel.updateOne(
          { _id: nextDeposit._id, userId, remainingAmount: { $gte: nextAmount } },
          { $inc: { remainingAmount: -nextAmount, spentAmount: nextAmount } }, { session }
        );
        if (reserve.modifiedCount !== 1) { failure = { status: 400, message: "Expense exceeds remaining amount for this exact deposit." }; throw new Error("EXPENSE_ABORT"); }
        await DepositModel.updateOne({ userId, depositId: previousDepositId }, { $inc: { remainingAmount: expense.amount, spentAmount: -expense.amount } }, { session });
        expense.depositReference = nextDeposit._id;
      } else {
        const delta = nextAmount - expense.amount;
        if (delta > 0) {
          const reserve = await DepositModel.updateOne(
            { userId, depositId: previousDepositId, remainingAmount: { $gte: delta } },
            { $inc: { remainingAmount: -delta, spentAmount: delta } }, { session }
          );
          if (reserve.modifiedCount !== 1) { failure = { status: 400, message: "Expense exceeds remaining amount for this exact deposit." }; throw new Error("EXPENSE_ABORT"); }
        } else if (delta < 0) {
          await DepositModel.updateOne({ userId, depositId: previousDepositId }, { $inc: { remainingAmount: -delta, spentAmount: delta } }, { session });
        }
      }
      Object.assign(expense, payload);
      await expense.save({ session });
      await recalculateDeposit(userId, previousDepositId, session);
      if (nextDepositId !== previousDepositId) await recalculateDeposit(userId, nextDepositId, session);
      updatedExpense = expense;
    });
  } catch (error) {
    if (failure) return NextResponse.json({ message: failure.message }, { status: failure.status });
    throw error;
  } finally {
    await session.endSession();
  }
  return NextResponse.json(updatedExpense);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser({ csrf: true }, _); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const { id } = await params;
  const session = await mongoose.startSession();
  let failure = false;
  try {
    await session.withTransaction(async () => {
      const expense = await ExpenseModel.findOne({ _id: id, userId }).session(session);
      if (!expense) { failure = true; return; }
      if (expense.bankTransactionId) throw new Error("Imported expenses cannot be deleted here.");
      await ExpenseModel.deleteOne({ _id: id, userId }, { session });
      await recalculateDeposit(userId, expense.depositId, session);
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Imported expenses cannot be deleted here.") return NextResponse.json({ message: error.message }, { status: 400 });
    throw error;
  } finally {
    await session.endSession();
  }
  if (failure) return NextResponse.json({ message: "Expense not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
