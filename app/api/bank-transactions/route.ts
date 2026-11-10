import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { BankTransactionModel } from "@/models/BankTransaction";
import { requireUser } from "@/lib/auth";

const statuses = ["PENDING", "CONFIRMED", "IGNORED", "REVERSED"] as const;

export async function GET(request: Request) {
  const auth = await requireUser({}, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const { searchParams } = new URL(request.url);
  const requestedStatus = searchParams.get("status") ?? "PENDING";
  if (!statuses.includes(requestedStatus as (typeof statuses)[number])) {
    return NextResponse.json({ message: "Invalid transaction status." }, { status: 400 });
  }
  const page = Number(searchParams.get("page") ?? "1");
  if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) {
    return NextResponse.json({ message: "Invalid page number." }, { status: 400 });
  }
  const pageSize = 50;
  const results = await BankTransactionModel.find({ userId, status: requestedStatus })
    .sort({ timestamp: -1, _id: -1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize + 1)
    .lean();
  return NextResponse.json({ transactions: results.slice(0, pageSize), page, hasMore: results.length > pageSize });
}
