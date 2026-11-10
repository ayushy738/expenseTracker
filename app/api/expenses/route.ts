import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { recalculateDeposit } from "@/lib/finance";
import { DepositModel } from "@/models/Deposit";
import { ExpenseModel } from "@/models/Expense";
import { categories } from "@/types/finance";
import mongoose from "mongoose";
import { requireUser } from "@/lib/auth";

const ExpenseSchema = z.object({
  amount: z.coerce.number().positive(),
  depositId: z.string().min(1),
  category: z.enum(categories as [string, ...string[]]),
  description: z.string().optional().default(""),
  date: z.coerce.date().optional()
});

export async function GET(request: Request) {
  const auth = await requireUser({}, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const { searchParams } = new URL(request.url);
  const query: Record<string, unknown> = { userId };
  if (searchParams.get("depositId")) query.depositId = searchParams.get("depositId");
  if (searchParams.get("category")) query.category = searchParams.get("category");

  const expenses = await ExpenseModel.find(query).populate("depositReference").sort({ date: -1 }).lean();
  return NextResponse.json(expenses);
}

export async function POST(request: Request) {
  const auth = await requireUser({ csrf: true }, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const payload = ExpenseSchema.parse(await request.json());
  await ExpenseModel.init();
  const session = await mongoose.startSession();
  let created: unknown;
  let failure: { status: number; message: string } | undefined;
  try {
    await session.withTransaction(async () => {
      const deposit = await DepositModel.findOne({ userId, depositId: payload.depositId }).session(session);
      if (!deposit) { failure = { status: 404, message: "Selected deposit does not exist." }; throw new Error("EXPENSE_ABORT"); }
      const reservation = await DepositModel.updateOne(
        { _id: deposit._id, userId, remainingAmount: { $gte: payload.amount } },
        { $inc: { remainingAmount: -payload.amount, spentAmount: payload.amount } },
        { session }
      );
      if (reservation.modifiedCount !== 1) { failure = { status: 400, message: "Expense exceeds remaining amount for this exact deposit." }; throw new Error("EXPENSE_ABORT"); }
      [created] = await ExpenseModel.create([{
        userId,
        ...payload,
        depositReference: deposit._id,
        date: payload.date ?? new Date()
      }], { session });
      await recalculateDeposit(userId, payload.depositId, session);
    });
  } catch (error) {
    if (failure) return NextResponse.json({ message: failure.message }, { status: failure.status });
    throw error;
  } finally {
    await session.endSession();
  }
  return NextResponse.json(created, { status: 201 });
}
