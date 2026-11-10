import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { DeviceModel } from "@/models/Device";
import { requireUser } from "@/lib/auth";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser({ csrf: true }, _); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ message: "Device not found." }, { status: 404 });
  const device = await DeviceModel.findOneAndUpdate({ _id: id, userId }, { $set: { revokedAt: new Date() } }, { new: true }).select("name revokedAt");
  if (!device) return NextResponse.json({ message: "Device not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
