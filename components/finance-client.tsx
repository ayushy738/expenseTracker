"use client";

import { type FormEvent, type InputHTMLAttributes, type ReactNode, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  ArrowDownToLine,
  CalendarDays,
  CircleDollarSign,
  Download,
  Filter,
  Landmark,
  Plus,
  ReceiptText,
  Search,
  Target,
  Trash2,
  WalletCards
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { categories, type DashboardSummary, type Deposit, type Expense, type Goal, type SavingsFund } from "@/types/finance";
import { formatCurrency, formatDate, toPercent } from "@/lib/utils";
import { apiFetch } from "@/lib/client-api";

const chartColors = ["#0d9488", "#f59e0b", "#2563eb", "#e11d48", "#7c3aed", "#16a34a", "#ea580c", "#0891b2", "#64748b"];

type View = "dashboard" | "deposits" | "deposit-detail" | "expenses" | "savings" | "analytics" | "goals";

export function FinanceClient({ view, depositId }: { view: View; depositId?: string }) {
  const { toast } = useToast();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [funds, setFunds] = useState<SavingsFund[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [depositRes, expenseRes, fundRes, goalRes] = await Promise.all([
          apiFetch("/api/deposits"),
          apiFetch("/api/expenses"),
          apiFetch("/api/savings-funds"),
          apiFetch("/api/goals")
        ]);
        if (![depositRes, expenseRes, fundRes, goalRes].every((res) => res.ok)) throw new Error("API unavailable");
        setDeposits(await depositRes.json());
        setExpenses(await expenseRes.json());
        setFunds(await fundRes.json());
        setGoals(await goalRes.json());
        setIsOffline(false);
      } catch {
        setDeposits([]);
        setExpenses([]);
        setFunds([]);
        setGoals([]);
        setIsOffline(true);
      }
    }
    load();
  }, []);

  const enrichedExpenses = useMemo(
    () =>
      expenses.map((expense) => ({
        ...expense,
        depositReference: expense.depositReference ?? deposits.find((deposit) => deposit.depositId === expense.depositId)
      })),
    [expenses, deposits]
  );

  const summary: DashboardSummary = useMemo(() => {
    const now = new Date();
    const isThisMonth = (value?: string | Date) => {
      const date = new Date(value ?? Date.now());
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    };
    return {
      currentBalance: deposits.reduce((sum, item) => sum + item.remainingAmount + item.savingsAmount, 0),
      totalDeposited: deposits.reduce((sum, item) => sum + item.amount, 0),
      totalSaved: deposits.reduce((sum, item) => sum + item.savingsAmount, 0),
      totalSpent: deposits.reduce((sum, item) => sum + item.spentAmount, 0),
      remainingMoney: deposits.reduce((sum, item) => sum + item.remainingAmount, 0),
      activeDeposits: deposits.filter((item) => item.remainingAmount > 0).length,
      monthlySpending: enrichedExpenses.filter((item) => !item.isReversed && isThisMonth(item.date)).reduce((sum, item) => sum + item.amount, 0),
      monthlySavings: deposits.filter((item) => isThisMonth(item.createdAt)).reduce((sum, item) => sum + item.savingsAmount, 0)
    };
  }, [deposits, enrichedExpenses]);

  const filteredDeposits = deposits.filter((deposit) => {
    const haystack = `${deposit.depositId} ${deposit.source} ${deposit.description}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (sourceFilter === "All" || deposit.source === sourceFilter);
  });

  const filteredExpenses = enrichedExpenses.filter((expense) => {
    const haystack = `${expense.category} ${expense.description} ${expense.depositId} ${expense.depositReference?.source ?? ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (categoryFilter === "All" || expense.category === categoryFilter);
  });

  async function createDeposit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const amount = Number(form.get("amount"));
    const savingsAmount = Number(form.get("savingsAmount"));
    const payload = {
      amount,
      source: String(form.get("source")),
      description: String(form.get("description") || ""),
      savingsAmount,
      savingsFundId: String(form.get("savingsFundId") || "") || undefined,
      createdAt: String(form.get("createdAt") || new Date().toISOString())
    };
    if (savingsAmount > amount) {
      toast({ title: "Savings is too high", description: "Savings cannot be greater than the deposit." });
      return;
    }

    try {
      const res = await apiFetch("/api/deposits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setDeposits((current) => [created, ...current]);
    } catch {
      setIsOffline(true);
      toast({ title: "Deposit was not saved", description: "Check the MongoDB connection and try again." });
      return;
    }
    formElement.reset();
    toast({ title: "Deposit created", description: "This deposit now has its own tracking branch." });
  }

  async function createExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const depositIdValue = String(form.get("depositId"));
    const amount = Number(form.get("amount"));
    const deposit = deposits.find((item) => item.depositId === depositIdValue);
    if (!deposit || amount > deposit.remainingAmount) {
      toast({ title: "Expense blocked", description: "This exact deposit does not have enough remaining money." });
      return;
    }
    const payload = {
      amount,
      depositId: depositIdValue,
      category: String(form.get("category")),
      description: String(form.get("description") || ""),
      date: String(form.get("date") || new Date().toISOString())
    };

    try {
      const res = await apiFetch("/api/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setExpenses((current) => [created, ...current]);
    } catch {
      setIsOffline(true);
      toast({ title: "Expense was not saved", description: "Check the MongoDB connection and try again." });
      return;
    }
    setDeposits((current) =>
      current.map((item) =>
        item.depositId === depositIdValue
          ? { ...item, spentAmount: item.spentAmount + amount, remainingAmount: item.remainingAmount - amount }
          : item
      )
    );
    formElement.reset();
    toast({ title: "Expense linked", description: `Spent from ${depositIdValue}, not the generic balance.` });
  }

  async function createFund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      name: String(form.get("name")),
      savedAmount: Number(form.get("savedAmount")),
      goalAmount: Number(form.get("goalAmount"))
    };
    try {
      const res = await apiFetch("/api/savings-funds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setFunds((current) => [created, ...current]);
    } catch {
      setIsOffline(true);
      toast({ title: "Savings fund was not saved", description: "Check the MongoDB connection and try again." });
      return;
    }
    formElement.reset();
  }

  async function createGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      name: String(form.get("name")),
      targetAmount: Number(form.get("targetAmount")),
      currentAmount: Number(form.get("currentAmount")),
      deadline: String(form.get("deadline") || "")
    };
    try {
      const res = await apiFetch("/api/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setGoals((current) => [created, ...current]);
    } catch {
      setIsOffline(true);
      toast({ title: "Goal was not saved", description: "Check the MongoDB connection and try again." });
      return;
    }
    formElement.reset();
  }

  async function deleteDeposit(id: string) {
    if (!confirm(`Delete ${id} and all expenses linked to it?`)) return;
    try {
      const res = await apiFetch(`/api/deposits/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setDeposits((current) => current.filter((item) => item.depositId !== id));
      setExpenses((current) => current.filter((item) => item.depositId !== id));
    } catch {
      setIsOffline(true);
      toast({ title: "Deposit was not deleted", description: "Check the MongoDB connection and try again." });
    }
  }

  async function editDeposit(deposit: Deposit) {
    const amount = Number(prompt("Deposit amount", String(deposit.amount)) ?? deposit.amount);
    const source = prompt("Source name", deposit.source) ?? deposit.source;
    const description = prompt("Description", deposit.description ?? "") ?? deposit.description;
    const savingsAmount = Number(prompt("Savings amount", String(deposit.savingsAmount)) ?? deposit.savingsAmount);
    if (!Number.isFinite(amount) || !Number.isFinite(savingsAmount) || savingsAmount > amount) {
      toast({ title: "Edit blocked", description: "Use valid numbers and keep savings within the deposit amount." });
      return;
    }
    const spentAmount = deposit.spentAmount;
    const spendableAmount = amount - savingsAmount;
    const remainingAmount = spendableAmount - spentAmount;
    const payload = { amount, source, description, savingsAmount };
    try {
      const res = await apiFetch(`/api/deposits/${deposit.depositId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error();
      setDeposits((current) =>
        current.map((item) =>
          item.depositId === deposit.depositId
            ? { ...item, ...payload, spendableAmount, remainingAmount }
            : item
        )
      );
    } catch {
      setIsOffline(true);
      toast({ title: "Deposit was not updated", description: "Check the MongoDB connection and try again." });
    }
  }

  async function deleteExpense(expense: Expense) {
    if (expense.bankTransactionId) {
      toast({ title: "Imported expense", description: "Imported expenses are retained with their bank transaction record." });
      return;
    }
    if (!confirm("Delete this expense?")) return;
    try {
      if (!expense._id) throw new Error();
      const res = await apiFetch(`/api/expenses/${expense._id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setExpenses((current) => current.filter((item) => item !== expense));
      setDeposits((current) =>
        current.map((item) =>
          item.depositId === expense.depositId
            ? { ...item, spentAmount: Math.max(0, item.spentAmount - expense.amount), remainingAmount: item.remainingAmount + expense.amount }
            : item
        )
      );
    } catch {
      setIsOffline(true);
      toast({ title: "Expense was not deleted", description: "Check the MongoDB connection and try again." });
    }
  }

  async function editExpense(expense: Expense) {
    if (expense.bankTransactionId) {
      toast({ title: "Imported expense", description: "Correct imported transactions from the transaction inbox." });
      return;
    }
    const amount = Number(prompt("Expense amount", String(expense.amount)) ?? expense.amount);
    const category = prompt("Category", expense.category) ?? expense.category;
    const description = prompt("Description", expense.description ?? "") ?? expense.description;
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Edit blocked", description: "Use a valid expense amount." });
      return;
    }
    const delta = amount - expense.amount;
    const deposit = deposits.find((item) => item.depositId === expense.depositId);
    if (deposit && delta > deposit.remainingAmount) {
      toast({ title: "Edit blocked", description: "The selected deposit does not have enough remaining money." });
      return;
    }
    const payload = { amount, category, description };
    try {
      if (!expense._id) throw new Error();
      const res = await apiFetch(`/api/expenses/${expense._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error();
      setExpenses((current) => current.map((item) => (item === expense ? { ...item, ...payload } as Expense : item)));
      setDeposits((current) =>
        current.map((item) =>
          item.depositId === expense.depositId
            ? { ...item, spentAmount: item.spentAmount + delta, remainingAmount: item.remainingAmount - delta }
            : item
        )
      );
    } catch {
      setIsOffline(true);
      toast({ title: "Expense was not updated", description: "Check the MongoDB connection and try again." });
    }
  }

  const common = {
    deposits,
    expenses: enrichedExpenses,
    funds,
    goals,
    summary,
    filteredDeposits,
    filteredExpenses,
    query,
    setQuery,
    categoryFilter,
    setCategoryFilter,
    sourceFilter,
    setSourceFilter,
    createDeposit,
    createExpense,
    createFund,
    createGoal,
    deleteDeposit,
    editDeposit,
    deleteExpense,
    editExpense,
    isOffline
  };

  if (view === "deposits") return <DepositsView {...common} />;
  if (view === "deposit-detail") return <DepositDetailView {...common} depositId={depositId ?? ""} />;
  if (view === "expenses") return <ExpensesView {...common} />;
  if (view === "savings") return <SavingsView {...common} />;
  if (view === "analytics") return <AnalyticsView {...common} />;
  if (view === "goals") return <GoalsView {...common} />;
  return <DashboardView {...common} />;
}

type CommonProps = {
  deposits: Deposit[];
  expenses: Expense[];
  funds: SavingsFund[];
  goals: Goal[];
  summary: DashboardSummary;
  filteredDeposits: Deposit[];
  filteredExpenses: Expense[];
  query: string;
  setQuery: (value: string) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  sourceFilter: string;
  setSourceFilter: (value: string) => void;
  createDeposit: (event: FormEvent<HTMLFormElement>) => void;
  createExpense: (event: FormEvent<HTMLFormElement>) => void;
  createFund: (event: FormEvent<HTMLFormElement>) => void;
  createGoal: (event: FormEvent<HTMLFormElement>) => void;
  deleteDeposit: (id: string) => void;
  editDeposit: (deposit: Deposit) => void;
  deleteExpense: (expense: Expense) => void;
  editExpense: (expense: Expense) => void;
  isOffline: boolean;
};

function PageHeader({ title, eyebrow, action }: { title: string; eyebrow: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
        <h1 className="mt-1 text-3xl font-bold tracking-normal md:text-5xl">{title}</h1>
      </div>
      {action}
    </div>
  );
}

function OfflineBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="mb-5 rounded-2xl border border-amber-300/50 bg-amber-100/70 px-4 py-3 text-sm text-amber-950 dark:bg-amber-400/12 dark:text-amber-100">
      MongoDB is not reachable. The interface is showing only records loaded from the database and will not save local-only changes.
    </div>
  );
}

function StatGrid({ summary }: { summary: DashboardSummary }) {
  const stats = [
    ["Current Balance", summary.currentBalance, WalletCards],
    ["Total Deposited", summary.totalDeposited, ArrowDownToLine],
    ["Total Saved", summary.totalSaved, Landmark],
    ["Total Spent", summary.totalSpent, ReceiptText],
    ["Remaining Money", summary.remainingMoney, CircleDollarSign],
    ["Active Deposits", summary.activeDeposits, CalendarDays],
    ["Monthly Spending", summary.monthlySpending, Filter],
    ["Monthly Savings", summary.monthlySavings, Target]
  ] as const;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map(([label, value, Icon], index) => (
        <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
          <Card className="overflow-hidden">
            <CardContent className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <p className="text-xl font-bold md:text-2xl">{label === "Active Deposits" ? value : formatCurrency(value)}</p>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

function DashboardView(props: CommonProps) {
  return (
    <>
      <PageHeader
        eyebrow="Personal finance"
        title="Every rupee knows its source."
        action={
          <Button asChild>
            <Link href="/deposits">
              <Plus className="h-4 w-4" />
              Add deposit
            </Link>
          </Button>
        }
      />
      <OfflineBanner show={props.isOffline} />
      <StatGrid summary={props.summary} />
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Financial Overview</CardTitle>
            <CardDescription>Deposit flow split by saved, spent, and remaining money.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <FlowChart deposits={props.deposits} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Savings Goals</CardTitle>
            <CardDescription>Progress toward the funds that matter.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {props.goals.slice(0, 3).map((goal) => (
              <ProgressRow key={goal._id ?? goal.name} label={goal.name} value={goal.currentAmount} total={goal.targetAmount} />
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <DepositList deposits={props.deposits.slice(0, 4)} onDelete={props.deleteDeposit} onEdit={props.editDeposit} compact />
        <ExpenseList expenses={props.expenses.slice(0, 5)} onDelete={props.deleteExpense} onEdit={props.editExpense} />
      </div>
    </>
  );
}

function DepositsView(props: CommonProps) {
  const sources = ["All", ...Array.from(new Set(props.deposits.map((item) => item.source)))];
  return (
    <>
      <PageHeader eyebrow="Deposit branches" title="Track each received amount." />
      <OfflineBanner show={props.isOffline} />
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <DepositForm funds={props.funds} onSubmit={props.createDeposit} />
        <Card>
          <CardHeader>
            <CardTitle>Search and Filters</CardTitle>
            <CardDescription>Find by source, description, or deposit ID.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <SearchInput value={props.query} onChange={props.setQuery} />
            <select className="h-11 rounded-xl border bg-background/70 px-3 text-sm" value={props.sourceFilter} onChange={(e) => props.setSourceFilter(e.target.value)}>
              {sources.map((source) => <option key={source}>{source}</option>)}
            </select>
          </CardContent>
        </Card>
      </div>
      <div className="mt-5">
        <DepositList deposits={props.filteredDeposits} onDelete={props.deleteDeposit} onEdit={props.editDeposit} />
      </div>
    </>
  );
}

function DepositDetailView(props: CommonProps & { depositId: string }) {
  const deposit = props.deposits.find((item) => item.depositId === props.depositId);
  const expenses = props.expenses.filter((item) => item.depositId === props.depositId);
  if (!deposit) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-lg font-semibold">Deposit not found</p>
          <Button asChild className="mt-4"><Link href="/deposits">Back to deposits</Link></Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <>
      <PageHeader eyebrow={deposit.depositId} title={deposit.source} action={<Button asChild variant="outline"><Link href="/deposits">All deposits</Link></Button>} />
      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>{formatCurrency(deposit.amount)} received</CardTitle>
            <CardDescription>{deposit.description || "No description"} • {formatDate(deposit.createdAt)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressRow label="Saved" value={deposit.savingsAmount} total={deposit.amount} />
            <ProgressRow label="Spent from spendable" value={deposit.spentAmount} total={deposit.spendableAmount} />
            <ProgressRow label="Remaining" value={deposit.remainingAmount} total={deposit.spendableAmount} />
            <div className="rounded-2xl bg-primary/10 p-4">
              <p className="text-sm text-muted-foreground">Exact answer</p>
              <p className="mt-1 font-semibold">
                From {deposit.depositId}, {formatCurrency(deposit.savingsAmount)} was saved, {formatCurrency(deposit.spentAmount)} was spent, and {formatCurrency(deposit.remainingAmount)} remains.
              </p>
            </div>
          </CardContent>
        </Card>
        <ExpenseList expenses={expenses} onDelete={props.deleteExpense} onEdit={props.editExpense} title="Expense Timeline" />
      </div>
    </>
  );
}

function ExpensesView(props: CommonProps) {
  return (
    <>
      <PageHeader eyebrow="Expense history" title="Every spend is tied to a deposit." />
      <OfflineBanner show={props.isOffline} />
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <ExpenseForm deposits={props.deposits} onSubmit={props.createExpense} />
        <Card>
          <CardHeader>
            <CardTitle>Search and Filters</CardTitle>
            <CardDescription>Search category, description, source, or deposit ID.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-[1fr_220px]">
            <SearchInput value={props.query} onChange={props.setQuery} />
            <select className="h-11 rounded-xl border bg-background/70 px-3 text-sm" value={props.categoryFilter} onChange={(e) => props.setCategoryFilter(e.target.value)}>
              {["All", ...categories].map((category) => <option key={category}>{category}</option>)}
            </select>
          </CardContent>
        </Card>
      </div>
      <div className="mt-5">
        <ExpenseList expenses={props.filteredExpenses} onDelete={props.deleteExpense} onEdit={props.editExpense} title="All Expenses" />
      </div>
    </>
  );
}

function SavingsView(props: CommonProps) {
  const total = props.funds.reduce((sum, item) => sum + item.savedAmount, 0);
  return (
    <>
      <PageHeader eyebrow="Savings system" title="Funds with visible growth." />
      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <FundForm onSubmit={props.createFund} />
        <Card>
          <CardHeader>
            <CardTitle>Total Savings</CardTitle>
            <CardDescription>{formatCurrency(total)} allocated across funds.</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <DistributionChart data={props.funds.map((item) => ({ name: item.name, value: item.savedAmount }))} />
          </CardContent>
        </Card>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {props.funds.map((fund) => (
          <Card key={fund._id ?? fund.name}>
            <CardContent className="p-5">
              <ProgressRow label={fund.name} value={fund.savedAmount} total={fund.goalAmount} />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function AnalyticsView(props: CommonProps) {
  const activeExpenses = props.expenses.filter((expense) => !expense.isReversed);
  const byCategory = groupTotals(activeExpenses, "category");
  const bySource = props.deposits.map((item) => ({ name: `${item.source} ${item.depositId}`, value: item.amount }));
  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title="Deposit flow analysis."
        action={
          <Button asChild variant="outline">
            <a href="/api/reports/export">
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </Button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Spending By Category"><DistributionChart data={byCategory} /></ChartCard>
        <ChartCard title="Spending By Source"><BarTotals data={bySource} /></ChartCard>
        <ChartCard title="Monthly Spending Trend"><TrendChart data={trendFromExpenses(activeExpenses)} /></ChartCard>
        <ChartCard title="Savings Growth Trend"><SavingsTrend deposits={props.deposits} /></ChartCard>
      </div>
      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Deposit Flow Analysis</CardTitle>
          <CardDescription>Received money split into savings, expenses, and remaining balance.</CardDescription>
        </CardHeader>
        <CardContent className="h-80"><FlowChart deposits={props.deposits} /></CardContent>
      </Card>
    </>
  );
}

function GoalsView(props: CommonProps) {
  return (
    <>
      <PageHeader eyebrow="Goals" title="Track future purchases." />
      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <GoalForm onSubmit={props.createGoal} />
        <div className="grid gap-4">
          {props.goals.map((goal) => (
            <Card key={goal._id ?? goal.name}>
              <CardContent className="p-5">
                <ProgressRow label={goal.name} value={goal.currentAmount} total={goal.targetAmount} detail={goal.deadline ? `Deadline ${formatDate(goal.deadline)}` : undefined} />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}

function DepositForm({ funds, onSubmit }: { funds: SavingsFund[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Deposit</CardTitle>
        <CardDescription>Each deposit gets a unique DEP ID and its own remaining balance.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-3">
          <Field name="amount" label="Amount" type="number" required />
          <Field name="source" label="Source Name" placeholder="Dad, Scholarship, Freelance" required />
          <Field name="description" label="Description" placeholder="Pocket money" />
          <Field name="savingsAmount" label="Savings Amount" type="number" defaultValue="0" required />
          <div className="grid gap-2">
            <Label htmlFor="savingsFundId">Savings Fund</Label>
            <select id="savingsFundId" name="savingsFundId" className="h-11 rounded-xl border bg-background/70 px-3 text-sm">
              <option value="">No specific fund</option>
              {funds.map((fund) => <option value={fund._id} key={fund._id ?? fund.name}>{fund.name}</option>)}
            </select>
          </div>
          <Field name="createdAt" label="Date" type="date" />
          <Button type="submit"><Plus className="h-4 w-4" />Create tracked deposit</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ExpenseForm({ deposits, onSubmit }: { deposits: Deposit[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Expense</CardTitle>
        <CardDescription>An expense can only spend from one selected deposit branch.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-3">
          <Field name="amount" label="Amount" type="number" required />
          <div className="grid gap-2">
            <Label htmlFor="depositId">Deposit Selection</Label>
            <select id="depositId" name="depositId" required className="h-11 rounded-xl border bg-background/70 px-3 text-sm">
              {deposits.filter((item) => item.remainingAmount > 0).map((deposit) => (
                <option value={deposit.depositId} key={deposit.depositId}>
                  {deposit.depositId} • {deposit.source} • {formatCurrency(deposit.remainingAmount)} left
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <select id="category" name="category" className="h-11 rounded-xl border bg-background/70 px-3 text-sm">
              {categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </div>
          <Field name="description" label="Description" placeholder="Samosa, Notebook, Auto" />
          <Field name="date" label="Date" type="date" />
          <Button type="submit"><ReceiptText className="h-4 w-4" />Add expense</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FundForm({ onSubmit }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Create Savings Fund</CardTitle><CardDescription>Allocate deposit savings into named funds.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-3">
          <Field name="name" label="Fund Name" placeholder="Emergency Fund" required />
          <Field name="savedAmount" label="Saved Amount" type="number" defaultValue="0" required />
          <Field name="goalAmount" label="Goal Amount" type="number" defaultValue="0" required />
          <Button type="submit"><Plus className="h-4 w-4" />Create fund</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function GoalForm({ onSubmit }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <Card>
      <CardHeader><CardTitle>Create Goal</CardTitle><CardDescription>Set a target amount and deadline.</CardDescription></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-3">
          <Field name="name" label="Goal Name" placeholder="Laptop" required />
          <Field name="targetAmount" label="Target Amount" type="number" required />
          <Field name="currentAmount" label="Current Saved" type="number" defaultValue="0" required />
          <Field name="deadline" label="Deadline" type="date" />
          <Button type="submit"><Target className="h-4 w-4" />Create goal</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field(props: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  const { label, name, ...inputProps } = props;
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...inputProps} />
    </div>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="pl-9" placeholder="Search everything" />
    </div>
  );
}

function DepositList({ deposits, onDelete, onEdit, compact = false }: { deposits: Deposit[]; onDelete: (id: string) => void; onEdit: (deposit: Deposit) => void; compact?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{compact ? "Recent Deposits" : "All Deposits"}</CardTitle>
        <CardDescription>Tap a card to see where that exact amount went.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {deposits.length === 0 ? <EmptyState text="No deposits match this view." /> : deposits.map((deposit) => (
          <div key={deposit.depositId} className="rounded-2xl border bg-background/48 p-4">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/deposits/${deposit.depositId}`} className="min-w-0">
                <p className="truncate text-lg font-bold">{deposit.source}</p>
                <p className="text-sm text-muted-foreground">{deposit.depositId} • {formatDate(deposit.createdAt)}</p>
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => onEdit(deposit)}>Edit</Button>
                <Button variant="ghost" size="icon" aria-label="Delete deposit" onClick={() => onDelete(deposit.depositId)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <MiniMetric label="Saved" value={deposit.savingsAmount} />
              <MiniMetric label="Spent" value={deposit.spentAmount} />
              <MiniMetric label="Left" value={deposit.remainingAmount} />
            </div>
            <Progress className="mt-4" value={toPercent(deposit.spentAmount, deposit.spendableAmount)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ExpenseList({ expenses, onDelete, onEdit, title = "Recent Expenses" }: { expenses: Expense[]; onDelete: (expense: Expense) => void; onEdit: (expense: Expense) => void; title?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Each expense points back to its deposit ID.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {expenses.length === 0 ? <EmptyState text="No expenses match this view." /> : expenses.map((expense, index) => (
          <div key={`${expense._id ?? expense.depositId}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border bg-background/48 p-4">
            <div className="min-w-0">
              <span className="rounded-full bg-primary/12 px-2 py-1 text-xs font-semibold text-primary">{expense.category}</span>
              {expense.bankTransactionId ? <span className="ml-2 rounded-full bg-muted px-2 py-1 text-xs">Imported</span> : null}
              {expense.isReversed ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">Reversed</span> : null}
              <p className={`mt-2 truncate font-semibold ${expense.isReversed ? "line-through opacity-60" : ""}`}>{expense.description || "Untitled expense"}{expense.isTest ? " · TEST" : ""}</p>
              <p className="text-sm text-muted-foreground">{expense.depositId} • {expense.depositReference?.source ?? "Deposit"} • {formatDate(expense.date)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <p className="font-bold">{formatCurrency(expense.amount)}</p>
              {!expense.bankTransactionId ? <>
                <Button variant="ghost" size="sm" onClick={() => onEdit(expense)}>Edit</Button>
                <Button variant="ghost" size="icon" aria-label="Delete expense" onClick={() => onDelete(expense)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </> : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted/70 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate font-bold">{formatCurrency(value)}</p>
    </div>
  );
}

function ProgressRow({ label, value, total, detail }: { label: string; value: number; total: number; detail?: string }) {
  const percent = toPercent(value, total);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-semibold">{label}</p>
          {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
        </div>
        <p className="shrink-0 text-sm font-bold">{formatCurrency(value)} / {formatCurrency(total)}</p>
      </div>
      <Progress value={percent} />
      <p className="mt-1 text-xs text-muted-foreground">{percent}% complete</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{text}</div>;
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="h-72">{children}</CardContent>
    </Card>
  );
}

function DistributionChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={4}>
          {data.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}
        </Pie>
        <Tooltip formatter={(value: number) => formatCurrency(value)} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function BarTotals({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="name" hide />
        <YAxis hide />
        <Tooltip formatter={(value: number) => formatCurrency(value)} />
        <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#0d9488" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function TrendChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="name" />
        <YAxis hide />
        <Tooltip formatter={(value: number) => formatCurrency(value)} />
        <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={3} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SavingsTrend({ deposits }: { deposits: Deposit[] }) {
  const data = deposits
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .reduce<{ name: string; value: number }[]>((acc, deposit) => {
      const previous = acc.at(-1)?.value ?? 0;
      acc.push({ name: deposit.depositId, value: previous + deposit.savingsAmount });
      return acc;
    }, []);
  return <TrendChart data={data} />;
}

function FlowChart({ deposits }: { deposits: Deposit[] }) {
  const data = deposits.map((deposit) => ({
    name: deposit.depositId,
    saved: deposit.savingsAmount,
    spent: deposit.spentAmount,
    remaining: deposit.remainingAmount
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
        <XAxis dataKey="name" />
        <YAxis hide />
        <Tooltip formatter={(value: number) => formatCurrency(value)} />
        <Area type="monotone" dataKey="saved" stackId="1" stroke="#0d9488" fill="#0d9488" fillOpacity={0.72} />
        <Area type="monotone" dataKey="spent" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.72} />
        <Area type="monotone" dataKey="remaining" stackId="1" stroke="#2563eb" fill="#2563eb" fillOpacity={0.72} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function groupTotals<T extends Record<string, unknown>>(items: T[], key: keyof T) {
  const grouped = items.reduce<Record<string, number>>((acc, item) => {
    const name = String(item[key]);
    acc[name] = (acc[name] ?? 0) + Number(item.amount ?? 0);
    return acc;
  }, {});
  return Object.entries(grouped).map(([name, value]) => ({ name, value }));
}

function trendFromExpenses(expenses: Expense[]) {
  const grouped = expenses.reduce<Record<string, number>>((acc, expense) => {
    const month = new Date(expense.date).toLocaleString("en-IN", { month: "short" });
    acc[month] = (acc[month] ?? 0) + expense.amount;
    return acc;
  }, {});
  return Object.entries(grouped).map(([name, value]) => ({ name, value }));
}
