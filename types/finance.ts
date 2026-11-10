export type ExpenseCategory =
  | "Food"
  | "Education"
  | "Travel"
  | "Personal"
  | "Medical"
  | "Entertainment"
  | "Shopping"
  | "Bills"
  | "Other";

export type Deposit = {
  _id?: string;
  depositId: string;
  amount: number;
  source: string;
  description?: string;
  savingsAmount: number;
  spendableAmount: number;
  spentAmount: number;
  remainingAmount: number;
  savingsFundId?: string;
  createdAt: string;
};

export type Expense = {
  _id?: string;
  amount: number;
  category: ExpenseCategory;
  description?: string;
  depositId: string;
  depositReference?: Deposit;
  date: string;
  bankTransactionId?: string;
  isReversed?: boolean;
  reversedAt?: string;
  reversalReason?: string;
  createdAt?: string;
};

export type SavingsFund = {
  _id?: string;
  name: string;
  savedAmount: number;
  goalAmount: number;
  createdAt?: string;
};

export type Goal = {
  _id?: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  createdAt?: string;
};

export type BankTransactionStatus = "PENDING" | "CONFIRMED" | "IGNORED" | "REVERSED";

export type BankTransaction = {
  _id: string;
  amount: number;
  transactionType: "DEBIT" | "CREDIT";
  merchant?: string;
  bank?: string;
  reference?: string;
  timestamp: string;
  depositId?: string;
  category: ExpenseCategory;
  status: BankTransactionStatus;
  expenseId?: string;
  createdAt: string;
};

export type DashboardSummary = {
  currentBalance: number;
  totalDeposited: number;
  totalSaved: number;
  totalSpent: number;
  remainingMoney: number;
  activeDeposits: number;
  monthlySpending: number;
  monthlySavings: number;
};

export const categories: ExpenseCategory[] = [
  "Food",
  "Education",
  "Travel",
  "Personal",
  "Medical",
  "Entertainment",
  "Shopping",
  "Bills",
  "Other"
];
