import { addDays, monthRange, startOfDay, startOfWeek } from "./dates";
export function workspaceURL(now = new Date()) {
  const [month, nextMonth] = monthRange(now),
    week = startOfWeek(now);
  return `/api/data?${new URLSearchParams({
    view: "workspace",
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
