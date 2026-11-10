type ConfirmableTransaction = {
  status: string;
  transactionType: string;
  amount: number;
};

type DepositBalance = { remainingAmount: number } | null;

export function getConfirmationBlock(transaction: ConfirmableTransaction, deposit: DepositBalance) {
  if (transaction.status !== "PENDING") return { status: 409, message: "Transaction is no longer pending." };
  if (transaction.transactionType !== "DEBIT") return { status: 400, message: "Credits and refunds cannot be confirmed as expenses." };
  if (!deposit) return { status: 404, message: "Selected deposit does not exist." };
  if (deposit.remainingAmount < transaction.amount) return { status: 400, message: "Transaction exceeds the selected deposit's remaining amount." };
  return null;
}
