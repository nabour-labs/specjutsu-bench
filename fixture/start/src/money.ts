/** An amount of money in integer cents. */
export type Cents = number;

/** Converts a decimal amount (12.34) to cents (1234). */
export function toCents(amount: number): Cents {
  return Math.round(amount * 100);
}

/** `percent` per cent of `amount`, rounded to the nearest cent. */
export function percentOf(amount: Cents, percent: number): Cents {
  return Math.round((amount * percent) / 100);
}

/** Formats cents as dollars: 123456 becomes "$1,234.56", -50 becomes "-$0.50". */
export function formatCents(amount: Cents): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const cents = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars}.${cents}`;
}
