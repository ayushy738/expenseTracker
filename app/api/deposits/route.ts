import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { applySavingsToFund, getNextDepositId, normalizeDepositAmounts } from "@/lib/finance";
import { DepositModel } from "@/models/Deposit";
import { SavingsFundModel } from "@/models/SavingsFund";
import mongoose from "mongoose";
import { requireUser } from "@/lib/auth";

const DepositSchema = z.object({
  amount: z.coerce.number().positive(),
  source: z.string().min(1),
  description: z.string().optional().default(""),
  savingsAmount: z.coerce.number().min(0).default(0),
  savingsFundId: z.string().optional(),
  createdAt: z.coerce.date().optional()
});

export async function GET(request: Request) {
  const auth = await requireUser({}, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const deposits = await DepositModel.find({ userId }).sort({ createdAt: -1 }).lean();
  return NextResponse.json(deposits);
}

export async function POST(request: Request) {
  const auth = await requireUser({ csrf: true }, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const payload = DepositSchema.parse(await request.json());

  if (payload.savingsAmount > payload.amount) {
    return NextResponse.json({ message: "Savings cannot be greater than deposit amount." }, { status: 400 });
  }

  await DepositModel.init();
  const session = await mongoose.startSession();
  let created: unknown;
  let missingSavingsFund = false;
  try {
    await session.withTransaction(async () => {
      if (payload.savingsFundId && !await SavingsFundModel.exists({ _id: payload.savingsFundId, userId }).session(session)) { missingSavingsFund = true; return; }
      const depositId = await getNextDepositId(userId, session);
      const amounts = normalizeDepositAmounts(payload.amount, payload.savingsAmount);
      [created] = await DepositModel.create([{
        userId,
        ...payload,
        depositId,
        spentAmount: 0,
        ...amounts,
        createdAt: payload.createdAt ?? new Date()
      }], { session });
      await applySavingsToFund(userId, payload.savingsFundId, payload.savingsAmount, session);
    });
  } finally {
    await session.endSession();
  }
  if (missingSavingsFund) return NextResponse.json({ message: "Selected savings fund does not exist." }, { status: 404 });
  return NextResponse.json(created, { status: 201 });
}
