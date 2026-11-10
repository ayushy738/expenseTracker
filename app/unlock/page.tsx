import { redirect } from "next/navigation";
import { PinUnlockForm } from "@/components/auth-forms";
import { getSessionContext } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { UserModel } from "@/models/User";
export const dynamic = "force-dynamic";
export default async function UnlockPage() {
  const session = await getSessionContext({ allowPinLocked: true }); if (!session) redirect("/login");
  await connectToDatabase(); const user = await UserModel.findById(session.userId).select("pinHash name").lean() as { pinHash?: string; name: string } | null;
  if (!user?.pinHash) redirect("/settings");
  return <main className="mx-auto grid min-h-screen max-w-sm content-center gap-5 px-5"><div><h1 className="text-2xl font-bold">Quick unlock</h1><p className="mt-1 text-sm text-muted-foreground">Welcome back, {user.name}. Enter your PIN to continue this session.</p></div><PinUnlockForm /></main>;
}
