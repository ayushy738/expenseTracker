import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { createDeviceToken, hashDeviceToken } from "@/lib/device-token";
import { DeviceModel } from "@/models/Device";
import { requireUser } from "@/lib/auth";

const CreateDeviceSchema = z.object({ name: z.string().trim().min(1).max(80) });

export async function GET(request: Request) {
  const auth = await requireUser({}, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  await DeviceModel.init();
  const devices = await DeviceModel.find({ userId }).select("name lastUsedAt revokedAt createdAt").sort({ createdAt: -1 }).lean();
  return NextResponse.json(devices);
}

export async function POST(request: Request) {
  const auth = await requireUser({ csrf: true }, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  await DeviceModel.init();
  const form = await request.formData().catch(() => null);
  const parsed = CreateDeviceSchema.safeParse({ name: form?.get("name") });
  if (!parsed.success) return new Response("A device name is required.", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  const token = createDeviceToken();
  const device = await DeviceModel.create({ userId, name: parsed.data.name, tokenHash: hashDeviceToken(token), revokedAt: null });
  return new Response(`Device ${device.name} created. Copy the token below to your Android app now; it will not be shown again.\n\n${token}\n\nReturn to the dashboard and refresh.`, {
    status: 201,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'"
    }
  });
}
