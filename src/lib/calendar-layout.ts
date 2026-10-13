import { addDays } from "./dates";
import type { CalendarEvent } from "./types";

export type EventPlacement = {
  event: CalendarEvent;
  column: number;
  columns: number;
};

export function eventsForDay(
  events: CalendarEvent[],
  day: Date,
  category: string,
) {
  const start = +day;
  const end = +addDays(day, 1);
  return events
    .filter(
      (event) =>
        (category === "全部" || event.category === category) &&
        +new Date(event.start) < end &&
        +new Date(event.end) > start,
    )
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));
}

// Adjacent intervals can share a column; connected overlaps share a width.
export function placeEvents(events: CalendarEvent[]): EventPlacement[] {
  const placements: EventPlacement[] = [];
  let group: EventPlacement[] = [];
  let groupEnd = -Infinity;
  const ends: number[] = [];
  const flush = () => {
    const columns = Math.max(1, ends.length);
    for (const placement of group) placement.columns = columns;
    placements.push(...group);
    group = [];
    ends.length = 0;
  };
  for (const event of [...events].sort(
    (a, b) => +new Date(a.start) - +new Date(b.start),
  )) {
    const begin = +new Date(event.start);
    const end = +new Date(event.end);
    if (begin >= groupEnd) flush();
    let column = ends.findIndex((value) => value <= begin);
    if (column < 0) column = ends.length;
    ends[column] = end;
    group.push({ event, column, columns: 1 });
    groupEnd = Math.max(groupEnd, end);
  }
  flush();
  return placements;
}
