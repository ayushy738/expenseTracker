import { FinanceClient } from "@/components/finance-client";

export default async function DepositDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FinanceClient view="deposit-detail" depositId={id} />;
}
