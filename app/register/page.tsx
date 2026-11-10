import Link from "next/link";
import { RegisterForm } from "@/components/auth-forms";
export default function RegisterPage() { return <main className="mx-auto grid min-h-screen max-w-md content-center gap-5 px-5"><Link href="/" className="text-sm text-primary">Deposit Flow Finance</Link><div><h1 className="text-2xl font-bold">Create your account</h1><p className="mt-1 text-sm text-muted-foreground">Your dashboard will start empty.</p></div><RegisterForm /></main>; }
