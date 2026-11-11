import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { DeviceModel } from "@/models/Device";
import { requireUser } from "@/lib/auth";
import { readJsonLimited } from "@/lib/request-body";

const DeviceActionSchema = z.object({ action: z.enum(["approve", "deny"]) }).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser({ csrf: true }, request);
  if (auth.response) return auth.response;
  await connectToDatabase();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ message: "Device not found." }, { status: 404 });
  const body = await readJsonLimited(request, 4096);
  const parsed = DeviceActionSchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) return NextResponse.json({ message: "Invalid device action." }, { status: 400 });
  const pendingFilter = { _id: id, userId: auth.context.userId, status: "PENDING", revokedAt: null };
  if (parsed.data.action === "approve") {
    const device = await DeviceModel.findOneAndUpdate(pendingFilter, { $set: { status: "ACTIVE", approvedAt: new Date() } }, { new: true }).select("_id status approvedAt");
    if (device) return NextResponse.json({ id: String(device._id), status: device.status, approvedAt: device.approvedAt });
    const existing = await DeviceModel.findOne({ _id: id, userId: auth.context.userId }).select("status revokedAt");
    if (!existing) return NextResponse.json({ message: "Device not found." }, { status: 404 });
    if (existing.status === "ACTIVE" && !existing.revokedAt) return NextResponse.json({ id, status: "ACTIVE" });
    return NextResponse.json({ message: "Only a pending device can be approved." }, { status: 409 });
  }
  const denied = await DeviceModel.findOneAndUpdate(pendingFilter, { $set: { status: "REVOKED", revokedAt: new Date() } }, { new: true }).select("_id status");
  if (denied) return NextResponse.json({ id: String(denied._id), status: denied.status });
  const existing = await DeviceModel.findOne({ _id: id, userId: auth.context.userId }).select("status");
  if (!existing) return NextResponse.json({ message: "Device not found." }, { status: 404 });
  if (existing.status === "REVOKED") return NextResponse.json({ id, status: "REVOKED" });
  return NextResponse.json({ message: "Only a pending device can be denied." }, { status: 409 });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser({ csrf: true }, _); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ message: "Device not found." }, { status: 404 });
  const device = await DeviceModel.findOneAndUpdate({ _id: id, userId, status: { $ne: "REVOKED" } }, { $set: { status: "REVOKED", revokedAt: new Date() } }, { new: true }).select("name status revokedAt");
  if (!device) return NextResponse.json({ message: "Device not found." }, { status: 404 });
  return NextResponse.json({ ok: true, status: device.status });
}
