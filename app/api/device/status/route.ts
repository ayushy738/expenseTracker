import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { findDeviceForToken } from "@/lib/device-auth";
import { DeviceModel } from "@/models/Device";

export async function GET(request: Request) {
  await connectToDatabase();
  const deviceTime = Number(request.headers.get("x-device-timestamp"));
  if (!Number.isFinite(deviceTime) || Math.abs(Date.now() - deviceTime) > 5 * 60 * 1000) {
    return NextResponse.json({ code: "CLOCK_SKEW", message: "Device clock is outside the accepted window." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const device = await findDeviceForToken(request);
  if (!device) return NextResponse.json({ message: "Invalid device credentials." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const current = await DeviceModel.findById(device._id).select("status revokedAt").lean() as unknown as { status?: string; revokedAt?: Date | null } | null;
  if (!current) return NextResponse.json({ message: "Invalid device credentials." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const status = current.revokedAt || current.status === "REVOKED" ? "REVOKED" : current.status ?? "ACTIVE";
  return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
}
