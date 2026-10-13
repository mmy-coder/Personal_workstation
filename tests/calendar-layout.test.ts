import test from "node:test";
import assert from "node:assert/strict";
import { eventsForDay, placeEvents } from "../src/lib/calendar-layout";
import type { CalendarEvent } from "../src/lib/types";

function event(id: string, start: string, end: string): CalendarEvent {
  return {
    id,
    start,
    end,
    category: "工作",
    title: id,
    description: "",
    completed: false,
    version: 0,
    createdAt: start,
    updatedAt: start,
  };
}
test("日历重叠分栏可复用空列，相邻独立日程恢复全宽", () => {
  const a = event("a", "2026-10-13T09:00:00", "2026-10-13T12:00:00");
  const b = event("b", "2026-10-13T10:00:00", "2026-10-13T11:00:00");
  const c = event("c", "2026-10-13T11:00:00", "2026-10-13T13:00:00");
  const d = event("d", "2026-10-13T13:00:00", "2026-10-13T14:00:00");
  const input = [d, c, b, a];
  assert.deepEqual(
    placeEvents(input).map((p) => [p.event.id, p.column, p.columns]),
    [
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 1, 2],
      ["d", 0, 1],
    ],
  );
  assert.equal(input[0], d);
});
test("每日筛选包含跨天日程，排除恰好结束于零点的日程", () => {
  const crossing = event("cross", "2026-10-12T23:30:00", "2026-10-13T00:30:00");
  const previous = event(
    "previous",
    "2026-10-12T23:00:00",
    "2026-10-13T00:00:00",
  );
  const day = new Date(2026, 9, 13);
  assert.deepEqual(eventsForDay([previous, crossing], day, "全部"), [crossing]);
  assert.deepEqual(eventsForDay([crossing], day, "运动"), []);
});
