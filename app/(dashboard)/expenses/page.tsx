import { FinanceClient } from "@/components/finance-client";
import { TransactionInbox } from "@/components/transaction-inbox";

export default function ExpensesPage() {
  return <><FinanceClient view="expenses" /><TransactionInbox /></>;
}
