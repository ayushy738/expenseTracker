import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getSessionContext } from "@/lib/auth";
import { UserModel } from "@/models/User";
import { connectToDatabase } from "@/lib/mongodb";

export const dynamic = "force-dynamic";
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext({ allowPinLocked: true });
  if (!session) redirect("/login");
  await connectToDatabase();
  const user = await UserModel.findById(session.userId).select("pinHash").lean() as { pinHash?: string } | null;
  if (user?.pinHash && session.pinUnlockedUntil <= new Date()) redirect("/unlock");
  return <AppShell>{children}</AppShell>;
}
