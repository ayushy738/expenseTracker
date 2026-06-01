import { DepositModel } from "@/models/Deposit";
import { ExpenseModel } from "@/models/Expense";
import { SavingsFundModel } from "@/models/SavingsFund";

export async function getNextDepositId() {
  const latest = (await DepositModel.findOne().sort({ depositId: -1 }).lean()) as { depositId?: string } | null;
  const current = latest?.depositId ? Number(String(latest.depositId).replace("DEP-", "")) : 0;
  return `DEP-${String(current + 1).padStart(3, "0")}`;
}

export function normalizeDepositAmounts(amount: number, savingsAmount: number, spentAmount = 0) {
  const spendableAmount = Math.max(0, amount - savingsAmount);
  const remainingAmount = spendableAmount - spentAmount;
  return { spendableAmount, remainingAmount };
}

export async function recalculateDeposit(depositId: string) {
  const deposit = await DepositModel.findOne({ depositId });
  if (!deposit) return null;

  const spentAmount = await ExpenseModel.aggregate([
    { $match: { depositId } },
    { $group: { _id: "$depositId", total: { $sum: "$amount" } } }
  ]);

  const totalSpent = spentAmount[0]?.total ?? 0;
  const { spendableAmount, remainingAmount } = normalizeDepositAmounts(
    deposit.amount,
    deposit.savingsAmount,
    totalSpent
  );

  deposit.spentAmount = totalSpent;
  deposit.spendableAmount = spendableAmount;
  deposit.remainingAmount = remainingAmount;
  await deposit.save();
  return deposit;
}

export async function applySavingsToFund(fundId: string | undefined, amount: number) {
  if (!fundId || amount <= 0) return;
  await SavingsFundModel.findByIdAndUpdate(fundId, { $inc: { savedAmount: amount } });
}

export async function reverseSavingsFromFund(fundId: string | undefined, amount: number) {
  if (!fundId || amount <= 0) return;
  await SavingsFundModel.findByIdAndUpdate(fundId, { $inc: { savedAmount: -amount } });
}
