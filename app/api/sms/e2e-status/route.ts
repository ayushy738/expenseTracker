import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { authenticateDevice } from "@/lib/device-auth";
import { isConfiguredE2eEmail, isE2eTestModeEnabled } from "@/lib/e2e-test-mode";
import { UserModel } from "@/models/User";

export async function GET(request: Request) {
  if (!isE2eTestModeEnabled()) return NextResponse.json({ enabled: false }, { status: 403 });
  if (!request.headers.get("x-device-timestamp")) {
    return NextResponse.json({ enabled: false }, { status: 401 });
  }
  await connectToDatabase();
  const auth = await authenticateDevice(request);
  if (!auth) return NextResponse.json({ enabled: false }, { status: 401 });
  if (auth.rateLimited) return NextResponse.json({ enabled: false }, { status: 429 });
  const user = await UserModel.findById(auth.userId).select("email").lean() as { email?: string } | null;
  if (!isConfiguredE2eEmail(user?.email)) return NextResponse.json({ enabled: false }, { status: 403 });
  return NextResponse.json({ enabled: true });
}
