import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { findDeviceForToken } from "@/lib/device-auth";
import { DeviceModel } from "@/models/Device";

export async function POST(request: Request) {
  await connectToDatabase();
  const device = await findDeviceForToken(request);
  if (!device) return NextResponse.json({ message: "Invalid device credentials." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (device.status === "REVOKED" || device.revokedAt) {
    return NextResponse.json({ status: "REVOKED" }, { headers: { "Cache-Control": "no-store" } });
  }
  await DeviceModel.updateOne({ _id: device._id, revokedAt: null }, { $set: { status: "REVOKED", revokedAt: new Date() } });
  return NextResponse.json({ status: "REVOKED" }, { headers: { "Cache-Control": "no-store" } });
}
