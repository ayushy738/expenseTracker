import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { recalculateDeposit } from "@/lib/finance";
import { BankTransactionModel } from "@/models/BankTransaction";
import { DepositModel } from "@/models/Deposit";
import { ExpenseModel } from "@/models/Expense";
import { categories } from "@/types/finance";
import { getConfirmationBlock } from "@/lib/confirmation-rules";
import { randomUUID } from "node:crypto";
import { requireUser } from "@/lib/auth";

const ConfirmSchema = z.object({
  action: z.literal("confirm"),
  depositId: z.string().min(1),
  category: z.enum(categories as [string, ...string[]])
});
const IgnoreSchema = z.object({ action: z.literal("ignore") });
const ReverseSchema = z.object({ action: z.literal("reverse"), reason: z.string().trim().min(1).max(240) });
const CorrectSchema = z.object({
  action: z.literal("correct"), reason: z.string().trim().min(1).max(240),
  amount: z.coerce.number().positive().optional(),
  merchant: z.string().trim().max(160).optional(),
  timestamp: z.coerce.date().optional(),
  category: z.enum(categories as [string, ...string[]]).optional()
});

class TransactionActionError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser({ csrf: true }, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ message: "Transaction not found." }, { status: 404 });
  const payload = IgnoreSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return NextResponse.json({ message: "Invalid action." }, { status: 400 });
  const transaction = await BankTransactionModel.findOneAndUpdate(
    { _id: id, userId, status: "PENDING" },
    { $set: { status: "IGNORED" }, $push: { history: { action: "IGNORED", at: new Date() } } },
    { new: true }
  );
  if (!transaction) return NextResponse.json({ message: "Transaction is no longer pending." }, { status: 409 });
  return NextResponse.json(transaction);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser({ csrf: true }, request); if (auth.response) return auth.response; const userId = auth.context.userId;
  await connectToDatabase();
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ message: "Transaction not found." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const correction = CorrectSchema.safeParse(body);
  const reversal = ReverseSchema.safeParse(body);
  if (correction.success || reversal.success) {
    const session = await mongoose.startSession();
    let result: { ok?: boolean; correctedTransactionId?: unknown; alreadyApplied?: boolean } = {};
    let failure: TransactionActionError | undefined;
    try {
      await session.withTransaction(async () => {
        const transaction = await BankTransactionModel.findOne({ _id: id, userId }).session(session);
        if (!transaction) throw new TransactionActionError(404, "Transaction not found.");
        if (transaction.status === "REVERSED" && (reversal.success || (correction.success && transaction.correctedTransactionId))) {
          result = { ok: true, correctedTransactionId: transaction.correctedTransactionId, alreadyApplied: true };
          return;
        }
        if (transaction.status !== "CONFIRMED" || !transaction.expenseId) throw new TransactionActionError(409, "Only a confirmed imported expense can be corrected or reversed.");
        const expense = await ExpenseModel.findOne({ _id: transaction.expenseId, userId }).session(session);
        if (!expense || expense.isReversed) throw new TransactionActionError(409, "Linked expense is missing or already reversed.");
        const at = new Date();
        const reason = correction.success ? correction.data.reason : reversal.data?.reason ?? "";
        const snapshot = { amount: transaction.amount, merchant: transaction.merchant, timestamp: transaction.timestamp, category: transaction.category, depositId: transaction.depositId, expenseId: transaction.expenseId };
        expense.isReversed = true;
        expense.reversedAt = at;
        expense.reversalReason = reason;
        await expense.save({ session });
        transaction.status = "REVERSED";
        transaction.history.push({ action: correction.success ? "CORRECTED" : "REVERSED", at, reason, snapshot });
        if (correction.success) {
          const corrected = await BankTransactionModel.create([{
            userId,
            amount: correction.data.amount ?? transaction.amount,
            transactionType: "DEBIT",
            merchant: correction.data.merchant ?? transaction.merchant,
            bank: transaction.bank,
            reference: transaction.reference,
            timestamp: correction.data.timestamp ?? transaction.timestamp,
            deviceId: transaction.deviceId,
            category: correction.data.category ?? transaction.category,
            status: "PENDING",
            fingerprint: `${transaction.fingerprint}:correction:${randomUUID()}`,
            isTest: transaction.isTest === true,
            testRunId: transaction.isTest === true ? randomUUID() : undefined,
            captureId: transaction.isTest === true ? randomUUID() : undefined,
            supersedesTransactionId: transaction._id
          }], { session });
          transaction.correctedTransactionId = corrected[0]._id;
          result = { ok: true, correctedTransactionId: corrected[0]._id };
        } else result = { ok: true };
        await transaction.save({ session });
        await recalculateDeposit(userId, expense.depositId, session);
      });
    } catch (error) {
      if (error instanceof TransactionActionError) failure = error;
      else throw error;
    } finally { await session.endSession(); }
    if (failure) return NextResponse.json({ message: failure.message }, { status: failure.status });
    return NextResponse.json(result);
  }
  const payload = ConfirmSchema.safeParse(body);
  if (!payload.success) return NextResponse.json({ message: "Choose a deposit and category, or provide a correction/reversal reason." }, { status: 400 });

  await ExpenseModel.init();
  const session = await mongoose.startSession();
  let expenseId: mongoose.Types.ObjectId | undefined;
  let alreadyConfirmed = false;
  try {
    await session.withTransaction(async () => {
      const transaction = await BankTransactionModel.findOne({ _id: id, userId }).session(session);
      if (!transaction) throw new TransactionActionError(404, "Transaction not found.");
      if (transaction.status === "CONFIRMED" && transaction.expenseId) {
        expenseId = transaction.expenseId;
        alreadyConfirmed = true;
        return;
      }
      const deposit = await DepositModel.findOne({ userId, depositId: payload.data.depositId }).session(session);
      const block = getConfirmationBlock(transaction, deposit);
      if (block) throw new TransactionActionError(block.status, block.message);
      if (!deposit) throw new TransactionActionError(404, "Selected deposit does not exist.");
      const reservation = await DepositModel.updateOne(
        { _id: deposit._id, userId, remainingAmount: { $gte: transaction.amount } },
        { $inc: { remainingAmount: -transaction.amount, spentAmount: transaction.amount } },
        { session }
      );
      if (reservation.modifiedCount !== 1) throw new TransactionActionError(400, "Transaction exceeds the selected deposit's remaining amount.");

      const [expense] = await ExpenseModel.create([{
        userId,
        amount: transaction.amount,
        category: payload.data.category,
        description: transaction.merchant || transaction.bank || "Bank transaction",
        depositId: deposit.depositId,
        depositReference: deposit._id,
        date: transaction.timestamp,
        bankTransactionId: transaction._id,
        isTest: transaction.isTest === true,
      }], { session });
      const updated = await BankTransactionModel.updateOne(
        { _id: transaction._id, userId, status: "PENDING" },
        { $set: { status: "CONFIRMED", depositId: deposit.depositId, category: payload.data.category, expenseId: expense._id }, $push: { history: { action: "CONFIRMED", at: new Date(), snapshot: { depositId: deposit.depositId, category: payload.data.category, expenseId: expense._id } } } },
        { session }
      );
      if (updated.modifiedCount !== 1) throw new TransactionActionError(409, "Transaction was confirmed by another request.");
      await recalculateDeposit(userId, deposit.depositId, session);
      expenseId = expense._id;
    });
  } catch (error) {
    if (error instanceof TransactionActionError) return NextResponse.json({ message: error.message }, { status: error.status });
    // A simultaneous confirmation can win the unique expense link; report its committed result.
    const committed = await BankTransactionModel.findOne({ _id: id, userId }).lean() as { status?: string; expenseId?: unknown } | null;
    if (committed?.status === "CONFIRMED" && committed.expenseId) {
      return NextResponse.json({ ok: true, alreadyConfirmed: true, expenseId: committed.expenseId });
    }
    throw error;
  } finally {
    await session.endSession();
  }
  return NextResponse.json({ ok: true, alreadyConfirmed, expenseId });
}
