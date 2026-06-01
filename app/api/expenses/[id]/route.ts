import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { recalculateDeposit } from "@/lib/finance";
import { DepositModel } from "@/models/Deposit";
import { ExpenseModel } from "@/models/Expense";
import { categories } from "@/types/finance";

const UpdateExpenseSchema = z.object({
  amount: z.coerce.number().positive().optional(),
  depositId: z.string().min(1).optional(),
  category: z.enum(categories as [string, ...string[]]).optional(),
  description: z.string().optional(),
  date: z.coerce.date().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectToDatabase();
  const { id } = await params;
  const payload = UpdateExpenseSchema.parse(await request.json());
  const expense = await ExpenseModel.findById(id);
  if (!expense) return NextResponse.json({ message: "Expense not found." }, { status: 404 });

  const previousDepositId = expense.depositId;
  if (payload.depositId && payload.depositId !== expense.depositId) {
    const deposit = await DepositModel.findOne({ depositId: payload.depositId });
    if (!deposit) return NextResponse.json({ message: "Selected deposit does not exist." }, { status: 404 });
    expense.depositReference = deposit._id;
  }

  Object.assign(expense, payload);
  await expense.save();
  await recalculateDeposit(previousDepositId);
  await recalculateDeposit(expense.depositId);
  return NextResponse.json(expense);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await connectToDatabase();
  const { id } = await params;
  const expense = await ExpenseModel.findByIdAndDelete(id);
  if (!expense) return NextResponse.json({ message: "Expense not found." }, { status: 404 });
  await recalculateDeposit(expense.depositId);
  return NextResponse.json({ ok: true });
}
