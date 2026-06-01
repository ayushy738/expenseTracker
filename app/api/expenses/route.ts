import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { recalculateDeposit } from "@/lib/finance";
import { DepositModel } from "@/models/Deposit";
import { ExpenseModel } from "@/models/Expense";
import { categories } from "@/types/finance";

const ExpenseSchema = z.object({
  amount: z.coerce.number().positive(),
  depositId: z.string().min(1),
  category: z.enum(categories as [string, ...string[]]),
  description: z.string().optional().default(""),
  date: z.coerce.date().optional()
});

export async function GET(request: Request) {
  await connectToDatabase();
  const { searchParams } = new URL(request.url);
  const query: Record<string, unknown> = {};
  if (searchParams.get("depositId")) query.depositId = searchParams.get("depositId");
  if (searchParams.get("category")) query.category = searchParams.get("category");

  const expenses = await ExpenseModel.find(query).populate("depositReference").sort({ date: -1 }).lean();
  return NextResponse.json(expenses);
}

export async function POST(request: Request) {
  await connectToDatabase();
  const payload = ExpenseSchema.parse(await request.json());
  const deposit = await DepositModel.findOne({ depositId: payload.depositId });
  if (!deposit) return NextResponse.json({ message: "Selected deposit does not exist." }, { status: 404 });
  if (payload.amount > deposit.remainingAmount) {
    return NextResponse.json({ message: "Expense exceeds remaining amount for this exact deposit." }, { status: 400 });
  }

  const expense = await ExpenseModel.create({
    ...payload,
    depositReference: deposit._id,
    date: payload.date ?? new Date()
  });
  await recalculateDeposit(payload.depositId);
  return NextResponse.json(expense, { status: 201 });
}
