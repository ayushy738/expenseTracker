import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { SavingsFundModel } from "@/models/SavingsFund";

const SavingsFundSchema = z.object({
  name: z.string().min(1),
  savedAmount: z.coerce.number().min(0).default(0),
  goalAmount: z.coerce.number().min(0).default(0)
});

export async function GET() {
  await connectToDatabase();
  const funds = await SavingsFundModel.find().sort({ createdAt: -1 }).lean();
  return NextResponse.json(funds);
}

export async function POST(request: Request) {
  await connectToDatabase();
  const payload = SavingsFundSchema.parse(await request.json());
  const fund = await SavingsFundModel.create(payload);
  return NextResponse.json(fund, { status: 201 });
}
