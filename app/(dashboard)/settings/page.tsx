import { AccountSettings } from "@/components/auth-forms";
export default function SettingsPage() { return <section className="grid gap-5"><div><h1 className="text-2xl font-bold">Account settings</h1><p className="text-sm text-muted-foreground">Manage your password and quick unlock PIN.</p></div><AccountSettings /></section>; }
