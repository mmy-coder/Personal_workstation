import { addDays, dateKey, monthRange, startOfDay, startOfWeek } from "./dates";
export function workspaceURL(now = new Date(), scope?: string) {
  const [month, nextMonth] = monthRange(now),
    week = startOfWeek(now);
  return `/api/data?${new URLSearchParams({
    view: "workspace",
    ...(scope
      ? {
          scope,
          localMonth: dateKey(month),
          renewalThrough: dateKey(addDays(now, 7)),
        }
      : {}),
    now: now.toISOString(),
    month: month.toISOString(),
    nextMonth: nextMonth.toISOString(),
    from: new Date(
      Math.min(+month, +week, +addDays(startOfDay(now), -6)),
    ).toISOString(),
    to: new Date(Math.max(+nextMonth, +addDays(week, 7))).toISOString(),
  })}`;
}
export function eventsURL(from: Date, to: Date) {
  return `/api/events?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })}`;
}
