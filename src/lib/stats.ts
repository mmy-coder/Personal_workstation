import type { CalendarEvent, Subscription } from "./types";
import { addDays, dateKey, localDate, startOfDay } from "./dates";
export function overlapHours(
  event: Pick<CalendarEvent, "start" | "end">,
  start: Date,
  end: Date,
) {
  return (
    Math.max(
      0,
      Math.min(+new Date(event.end), +end) -
        Math.max(+new Date(event.start), +start),
    ) / 3600000
  );
}
export function timeStats(events: CalendarEvent[], start: Date, end: Date) {
  let planned = 0,
    completed = 0,
    workCompleted = 0;
  const categories: Record<string, number> = {};
  for (const event of events) {
    const value = overlapHours(event, start, end);
    planned += value;
    if (event.completed) {
      completed += value;
      if (event.category === "工作") workCompleted += value;
    }
    categories[event.category] = (categories[event.category] || 0) + value;
  }
  return {
    planned,
    completed,
    workCompleted,
    rate: planned ? (completed / planned) * 100 : null,
    categories: Object.entries(categories)
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value })),
  };
}
export function dailyStats(events: CalendarEvent[], start: Date, end: Date) {
  const rows = [];
  for (let day = startOfDay(start); day < end; day = addDays(day, 1)) {
    const stats = timeStats(events, day, addDays(day, 1));
    rows.push({
      name: `${day.getMonth() + 1}/${day.getDate()}`,
      date: dateKey(day),
      计划: Number(stats.planned.toFixed(2)),
      完成: Number(stats.completed.toFixed(2)),
      工作: Number(stats.workCompleted.toFixed(2)),
    });
  }
  return rows;
}
export function conflicts(
  events: CalendarEvent[],
  candidate: Pick<CalendarEvent, "start" | "end"> & { id?: string },
) {
  return events.filter(
    (e) =>
      e.id !== candidate.id &&
      new Date(e.start) < new Date(candidate.end) &&
      new Date(e.end) > new Date(candidate.start),
  );
}
export function monthlyCost(sub: Subscription) {
  return sub.status === "使用中"
    ? sub.amountCents / (sub.cycle === "年付" ? 12 : 1)
    : 0;
}
export function annualCost(sub: Subscription) {
  return sub.status === "使用中"
    ? sub.amountCents * (sub.cycle === "年付" ? 1 : 12)
    : 0;
}
// Calendar recurrence clamps the anchor day to the final day of a shorter month.
export function billingInMonth(sub: Subscription, month: Date) {
  if (sub.status !== "使用中") return 0;
  const anchor = localDate(sub.nextRenewal);
  if (sub.cycle === "年付" && anchor.getMonth() !== month.getMonth()) return 0;
  const lastDay = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const occurrence = new Date(
    month.getFullYear(),
    month.getMonth(),
    Math.min(anchor.getDate(), lastDay),
  );
  return occurrence >= localDate(sub.startDate) ? sub.amountCents : 0;
}
export function renewalDays(sub: Subscription, now: Date) {
  return Math.round(
    (+localDate(sub.nextRenewal) - +startOfDay(now)) / 86400000,
  );
}
