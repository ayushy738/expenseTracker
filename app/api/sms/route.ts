import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { authenticateDevice } from "@/lib/device-auth";
import { transactionFingerprint } from "@/lib/transaction-fingerprint";
import { BankTransactionModel } from "@/models/BankTransaction";
import { readJsonLimited } from "@/lib/request-body";
import { TransactionIngestionSchema } from "@/lib/transaction-payload";
import { DeviceModel } from "@/models/Device";

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ message: "JSON is required." }, { status: 415 });
  }
  await connectToDatabase();
  await Promise.all([DeviceModel.init(), BankTransactionModel.init()]);
  const deviceTime = Number(request.headers.get("x-device-timestamp"));
  if (!Number.isFinite(deviceTime) || Math.abs(Date.now() - deviceTime) > 5 * 60 * 1000) {
    return NextResponse.json({ code: "CLOCK_SKEW", message: "Device clock is outside the accepted window." }, { status: 401 });
  }
  const auth = await authenticateDevice(request);
  if (!auth) return NextResponse.json({ code: "DEVICE_AUTH_REQUIRED", message: "Invalid or expired device credentials." }, { status: 401 });
  if (auth.rateLimited) return NextResponse.json({ message: "Device upload limit reached. Try again later." }, { status: 429 });

  const body = await readJsonLimited(request, 16_384);
  if (!body.ok) return NextResponse.json({ message: body.reason === "too_large" ? "Request body is too large." : "Invalid transaction payload." }, { status: body.reason === "too_large" ? 413 : 400 });
  const payload = TransactionIngestionSchema.safeParse(body.value);
  if (!payload.success) return NextResponse.json({ message: "Invalid transaction payload." }, { status: 400 });
  const timestamp = payload.data.timestamp;
  if (timestamp.getTime() < Date.now() - 5 * 365 * 24 * 60 * 60 * 1000 || timestamp.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    return NextResponse.json({ message: "Transaction timestamp is outside the accepted range." }, { status: 400 });
  }

  await BankTransactionModel.init();
  const fingerprint = transactionFingerprint({ ...payload.data, timestamp });
  const userId = auth.userId;
  const deviceId = auth.device._id;
  if (payload.data.captureId) {
    const captured = await BankTransactionModel.findOne({ userId, deviceId, captureId: payload.data.captureId }).lean() as { _id: unknown; status: string } | null;
    if (captured) return NextResponse.json({ id: captured._id, status: captured.status, duplicate: true });
  }
  const existing = await BankTransactionModel.findOne({ userId, fingerprint }).lean() as { _id: unknown; status: string } | null;
  if (existing) return NextResponse.json({ id: existing._id, status: existing.status, duplicate: true });

  try {
    const transaction = await BankTransactionModel.create({ ...payload.data, userId, timestamp, deviceId, fingerprint, status: "PENDING" }) as { _id: unknown; status: string };
    return NextResponse.json({ id: transaction._id, status: transaction.status, duplicate: false }, { status: 201 });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      const duplicate = payload.data.captureId
        ? await BankTransactionModel.findOne({ userId, deviceId, captureId: payload.data.captureId }).lean() as { _id: unknown; status: string } | null
        : null;
      const fingerprintDuplicate = duplicate ?? await BankTransactionModel.findOne({ userId, fingerprint }).lean() as { _id: unknown; status: string } | null;
      if (fingerprintDuplicate) return NextResponse.json({ id: fingerprintDuplicate._id, status: fingerprintDuplicate.status, duplicate: true });
    }
    throw error;
  }
}
