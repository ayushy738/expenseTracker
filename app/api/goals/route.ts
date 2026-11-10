import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { GoalModel } from "@/models/Goal";
import { requireUser } from "@/lib/auth";

const GoalSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.coerce.number().positive(),
  currentAmount: z.coerce.number().min(0).default(0),
  deadline: z.coerce.date().optional()
});

export async function GET(request: Request) {
  const auth = await requireUser({}, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const goals = await GoalModel.find({ userId }).sort({ createdAt: -1 }).lean();
  return NextResponse.json(goals);
}

export async function POST(request: Request) {
  const auth = await requireUser({ csrf: true }, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const payload = GoalSchema.parse(await request.json());
  const goal = await GoalModel.create({ ...payload, userId });
  return NextResponse.json(goal, { status: 201 });
}
