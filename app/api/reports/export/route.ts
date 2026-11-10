import { connectToDatabase } from "@/lib/mongodb";
import { DepositModel } from "@/models/Deposit";
import { ExpenseModel } from "@/models/Expense";
import { requireUser } from "@/lib/auth";

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export async function GET(request: Request) {
  const auth = await requireUser({}, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const deposits = await DepositModel.find({ userId }).sort({ createdAt: -1 }).lean();
  const expenses = await ExpenseModel.find({ userId }).sort({ date: -1 }).lean();

  const lines = [
    "type,id,source_or_category,amount,saved,spent,remaining,description,date,status",
    ...deposits.map((item) =>
      [
        "deposit",
        item.depositId,
        item.source,
        item.amount,
        item.savingsAmount,
        item.spentAmount,
        item.remainingAmount,
        item.description,
        item.createdAt?.toISOString?.() ?? item.createdAt,
        "active"
      ].map(csvEscape).join(",")
    ),
    ...expenses.map((item) =>
      [
        "expense",
        item.depositId,
        item.category,
        item.amount,
        "",
        "",
        "",
        item.description,
        item.date?.toISOString?.() ?? item.date,
        item.isReversed ? "reversed" : "active"
      ].map(csvEscape).join(",")
    )
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=deposit-flow-export.csv"
    }
  });
}
