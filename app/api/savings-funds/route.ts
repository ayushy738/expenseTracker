import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { SavingsFundModel } from "@/models/SavingsFund";
import { requireUser } from "@/lib/auth";

const SavingsFundSchema = z.object({
  name: z.string().min(1),
  savedAmount: z.coerce.number().min(0).default(0),
  goalAmount: z.coerce.number().min(0).default(0)
});

export async function GET(request: Request) {
  const auth = await requireUser({}, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const funds = await SavingsFundModel.find({ userId }).sort({ createdAt: -1 }).lean();
  return NextResponse.json(funds);
}

export async function POST(request: Request) {
  const auth = await requireUser({ csrf: true }, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const payload = SavingsFundSchema.parse(await request.json());
  const fund = await SavingsFundModel.create({ ...payload, userId });
  return NextResponse.json(fund, { status: 201 });
}
