import { dateKey, localDate } from "./dates";
export function nextRenewalDate(
  due: string,
  cycle: "月付" | "年付",
  anchorDay?: number | null,
) {
  const date = localDate(due),
    day = anchorDay || date.getDate();
  const target = new Date(
    date.getFullYear() + (cycle === "年付" ? 1 : 0),
    date.getMonth() + (cycle === "月付" ? 1 : 0),
    1,
  );
  target.setDate(
    Math.min(
      day,
      new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate(),
    ),
  );
  return dateKey(target);
}
export function paymentTrend(
  payments: { paidOn: string; amountCents: number }[],
) {
  const totals = new Map<string, number>();
  for (const p of payments) {
    const month = p.paidOn.slice(0, 7);
    totals.set(month, (totals.get(month) || 0) + p.amountCents);
  }
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, cents]) => ({ name, 实际付款: cents / 100 }));
}
