import { DepositModel } from "@/models/Deposit";
import { ExpenseModel } from "@/models/Expense";
import { SavingsFundModel } from "@/models/SavingsFund";
import type { ClientSession } from "mongoose";

export async function getNextDepositId(userId: string, session?: ClientSession) {
  const query = DepositModel.findOne({ userId }).sort({ depositId: -1 });
  if (session) query.session(session);
  const latest = (await query.lean()) as { depositId?: string } | null;
  const current = latest?.depositId ? Number(String(latest.depositId).replace("DEP-", "")) : 0;
  return `DEP-${String(current + 1).padStart(3, "0")}`;
}

export function normalizeDepositAmounts(amount: number, savingsAmount: number, spentAmount = 0) {
  const spendableAmount = Math.max(0, amount - savingsAmount);
  const remainingAmount = spendableAmount - spentAmount;
  return { spendableAmount, remainingAmount };
}

export async function recalculateDeposit(userId: string, depositId: string, session?: ClientSession) {
  const depositQuery = DepositModel.findOne({ userId, depositId });
  if (session) depositQuery.session(session);
  const deposit = await depositQuery;
  if (!deposit) return null;

  const aggregation = ExpenseModel.aggregate([
    { $match: { userId: deposit.userId, depositId, isReversed: { $ne: true } } },
    { $group: { _id: "$depositId", total: { $sum: "$amount" } } }
  ]);
  if (session) aggregation.session(session);
  const spentAmount = await aggregation;

  const totalSpent = spentAmount[0]?.total ?? 0;
  const { spendableAmount, remainingAmount } = normalizeDepositAmounts(
    deposit.amount,
    deposit.savingsAmount,
    totalSpent
  );

  deposit.spentAmount = totalSpent;
  deposit.spendableAmount = spendableAmount;
  deposit.remainingAmount = remainingAmount;
  if (session) await deposit.save({ session });
  else await deposit.save();
  return deposit;
}

export async function applySavingsToFund(userId: string, fundId: string | undefined, amount: number, session?: ClientSession) {
  if (!fundId || amount <= 0) return;
  await SavingsFundModel.findOneAndUpdate({ _id: fundId, userId }, { $inc: { savedAmount: amount } }, session ? { session } : undefined);
}

export async function reverseSavingsFromFund(userId: string, fundId: string | undefined, amount: number, session?: ClientSession) {
  if (!fundId || amount <= 0) return;
  await SavingsFundModel.findOneAndUpdate({ _id: fundId, userId }, { $inc: { savedAmount: -amount } }, session ? { session } : undefined);
}
