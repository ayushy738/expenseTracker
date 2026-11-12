import { QuickAddExpense } from "@/components/quick-add-expense";
import { getSessionContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function QuickAddPage() {
  const session = await getSessionContext();
  if (!session) return null; // DashboardLayout redirects expired and PIN-locked sessions before rendering.
  return <QuickAddExpense userId={session.userId} />;
}
