import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { DepositModel } from "@/models/Deposit";
import { ExpenseModel } from "@/models/Expense";
import { requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  const auth = await requireUser({}, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const deposits = await DepositModel.find({ userId, createdAt: { $gte: start, $lt: end } }).lean();
  const expenses = await ExpenseModel.find({ userId, date: { $gte: start, $lt: end }, isReversed: { $ne: true } }).lean();

  const received = deposits.reduce((sum, item) => sum + item.amount, 0);
  const saved = deposits.reduce((sum, item) => sum + item.savingsAmount, 0);
  const spent = expenses.reduce((sum, item) => sum + item.amount, 0);
  const remaining = deposits.reduce((sum, item) => sum + item.remainingAmount, 0);
  const categoryTotals = expenses.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + item.amount;
    return acc;
  }, {});
  const sourceTotals = deposits.reduce<Record<string, number>>((acc, item) => {
    acc[item.source] = (acc[item.source] ?? 0) + item.amount;
    return acc;
  }, {});

  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "None";
  const mostUsedDepositSource = Object.entries(sourceTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "None";

  return NextResponse.json({
    month,
    received,
    saved,
    spent,
    remaining,
    topCategory,
    mostUsedDepositSource
  });
}
