"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { BarChart3, CircleDollarSign, Goal, Home, Moon, PiggyBank, Plus, ReceiptText, Settings, Smartphone, Sun, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/deposits", label: "Deposits", icon: CircleDollarSign },
  { href: "/expenses", label: "Expenses", icon: ReceiptText },
  { href: "/expenses#inbox", label: "Inbox", icon: Smartphone },
  { href: "/savings", label: "Savings", icon: PiggyBank },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/goals", label: "Goals", icon: Goal },
  { href: "/settings", label: "Account", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [logoutError, setLogoutError] = useState("");
  const isQuickAdd = pathname === "/quick-add";
  async function logout() {
    const token = document.cookie.split("; ").find((part) => part.startsWith("finance_csrf="))?.split("=").slice(1).join("=") ?? "";
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", headers: { "x-csrf-token": token }, credentials: "same-origin", cache: "no-store" });
      if (!response.ok) throw new Error("Could not sign out.");
      window.location.assign("/login");
    } catch { setLogoutError("Could not sign out. Check your connection and try again."); }
  }

  return (
    <div className={isQuickAdd ? "min-h-[100dvh] overflow-x-clip" : "min-h-screen pb-24 md:pb-0"}>
      <header className={cn("sticky top-0 z-40 border-b bg-background/76 backdrop-blur-xl", isQuickAdd && "hidden md:block")}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
              <CircleDollarSign className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-muted-foreground">Deposit Flow</span>
              <span className="block truncate text-lg font-bold leading-5">Finance</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Button key={item.href} asChild variant={active ? "secondary" : "ghost"} size="sm">
                  <Link href={item.href}>
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                </Button>
              );
            })}
          </nav>
          <div className="flex items-center gap-2"><Button asChild className="hidden lg:inline-flex"><Link href="/quick-add"><Plus className="h-4 w-4" />Expense</Link></Button><Button variant="ghost" size="icon" aria-label="Sign out" onClick={logout}><LogOut className="h-4 w-4" /></Button><Button
            variant="outline"
            size="icon"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button></div>
        </div>
      </header>
      {logoutError ? <p className="mx-auto max-w-7xl px-4 pt-2 text-sm text-destructive" role="alert">{logoutError}</p> : null}
      <main className={isQuickAdd ? "mx-auto w-full max-w-7xl px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 md:py-8" : "mx-auto max-w-7xl px-4 py-5 md:py-8"}>{children}</main>
      {!isQuickAdd ? <Button asChild className="fixed bottom-[5.25rem] right-4 z-40 h-12 rounded-full px-5 shadow-lg md:hidden"><Link href="/quick-add"><Plus className="h-5 w-5" />Expense</Link></Button> : null}
      {!isQuickAdd ? <>
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/86 px-2 py-2 backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-8 gap-1">
          {nav.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium text-muted-foreground",
                  active && "bg-primary/12 text-primary"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      </> : null}
    </div>
  );
}
