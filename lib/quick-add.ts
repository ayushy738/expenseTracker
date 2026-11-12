import type { Deposit } from "@/types/finance";

/** Parse a rupee amount without going through binary floating-point arithmetic. */
export function parseRupeesToPaise(value: string): number | null {
  const normalized = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{0,2})?$/.test(normalized)) return null;
  const [wholePart, fractionPart = ""] = normalized.replaceAll(",", "").split(".");
  const whole = Number(wholePart);
  const paise = Number(`${fractionPart}00`.slice(0, 2));
  if (!Number.isSafeInteger(whole) || whole < 0) return null;
  const total = whole * 100 + paise;
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

export function paiseToApiAmount(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise <= 0) throw new RangeError("Amount must be a positive whole number of paise.");
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

export function paiseToCurrency(paise: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(paise / 100);
}

export function localDateInputValue(date = new Date()): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function eligibleDeposits(deposits: Deposit[]): Deposit[] {
  return deposits.filter((deposit) => Number.isFinite(deposit.remainingAmount) && deposit.remainingAmount > 0);
}

export function initialDepositId(deposits: Deposit[], rememberedId: string | null): string {
  const eligible = eligibleDeposits(deposits);
  if (eligible.length === 1) return eligible[0].depositId;
  return eligible.some((deposit) => deposit.depositId === rememberedId) ? rememberedId! : "";
}

export function amountExceedsDeposit(paise: number, remainingAmount: number): boolean {
  return paise > Math.round(remainingAmount * 100);
}

export function acquireSubmission(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}
