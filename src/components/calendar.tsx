"use client";
import { usePageState, choice, useScrollMemory } from "./use-page-state";
import { useMemo, useRef, useState } from "react";
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  CheckCheck,
  MousePointer2,
  GripHorizontal,
} from "lucide-react";
import { useRecords } from "./use-records";
import { eventsURL } from "@/lib/workspace-url";
import { requestJSON } from "@/lib/http";
import { useNow } from "./clock-provider";
import { useData } from "./provider";
import { Button } from "./ui/button";
import { PageHeading } from "./ui/shared";
import { EventEditor } from "./event-editor";
import { addDays, dateKey, hours, startOfWeek, timeLabel } from "@/lib/dates";
import { conflicts, timeStats } from "@/lib/stats";
import {
  categoryColors,
  eventCategories,
  type CalendarEvent,
} from "@/lib/types";
import { eventsForDay, placeEvents } from "@/lib/calendar-layout";
const HOUR = 48;
const EMPTY_EVENTS: CalendarEvent[] = [];
export function Calendar() {
  const { save, notify } = useData(),
    [week, setWeek] = usePageState("week", startOfWeek(new Date()), (value) => {
      const date = new Date(`${value}T00:00:00`);
      return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !isNaN(+date) &&
        dateKey(date) === value
        ? startOfWeek(date)
        : startOfWeek(new Date());
    });
  const now = useNow() || new Date();
  const [editor, setEditor] = useState<{
      event?: CalendarEvent;
      start?: Date;
    } | null>(null),
    [filter, setFilter] = usePageState<string>(
      "category",
      "全部",
      choice(["全部", ...eventCategories], "全部"),
    );
  const [view, setView] = usePageState<"week" | "day">(
    "view",
    "week",
    choice(["week", "day"], "week"),
  );
  const [dayIndex, setDayIndex] = usePageState(
    "day",
    (new Date().getDay() + 6) % 7,
    (raw) => Math.max(0, Math.min(6, Math.trunc(Number(raw)) || 0)),
  );
  const scroll = useRef<HTMLDivElement>(null),
    resizing = useRef(false);
  const weekTime = +week;
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(new Date(weekTime), i)),
    [weekTime],
  );
  const selectedDay = days[dayIndex];
  const visibleDays = view === "day" ? [selectedDay] : days;
  const query = useRecords<CalendarEvent[]>(eventsURL(week, addDays(week, 7)));
  const events = query.data || EMPTY_EVENTS;
  const stats = useMemo(
    () => timeStats(events, days[0], addDays(days[0], 7)),
    [events, days],
  );
  const dayLayouts = useMemo(
    () =>
      days.map((day) => {
        const visible = eventsForDay(events, day, filter);
        return {
          events: visible,
          placements: placeEvents(visible),
          planned: timeStats(events, day, addDays(day, 1)).planned,
        };
      }),
    [events, days, filter],
  );
  useScrollMemory(!!query.data, scroll, HOUR * 7);
  const dayEvents = dayLayouts[dayIndex].events;
  function addForDay(day: Date) {
    const start = new Date(day);
    start.setHours(14, 0, 0, 0);
    setEditor({ start });
  }
  function jumpTo(hour: number) {
    if (scroll.current) scroll.current.scrollTop = hour * HOUR;
  }
  async function move(event: CalendarEvent, start: Date, end: Date) {
    try {
      const currentEvents = await requestJSON<CalendarEvent[]>(
        eventsURL(start, end),
      );
      if (
        conflicts(currentEvents, {
          id: event.id,
          start: start.toISOString(),
          end: end.toISOString(),
        }).length &&
        !window.confirm("此时间与其他日程冲突，仍然保存吗？")
      )
        return;
      await save(
        "events",
        { start: start.toISOString(), end: end.toISOString() },
        event.id,
        event.version,
      );
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  function resize(e: React.PointerEvent, event: CalendarEvent) {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = true;
    const y = e.clientY;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const block = target.closest<HTMLElement>(".calendar-event");
    const initialHeight = block?.style.height;
    const update = (ev: PointerEvent) => {
      if (block)
        block.style.height = `${Math.max(20, parseFloat(initialHeight || "32") + (Math.round((ev.clientY - y) / (HOUR / 2)) * HOUR) / 2)}px`;
    };
    const finish = (ev: PointerEvent) => {
      target.removeEventListener("pointermove", update as EventListener);
      target.removeEventListener("pointerup", finish as EventListener);
      target.removeEventListener("pointercancel", cancel as EventListener);
      if (block && initialHeight) block.style.height = initialHeight;
      const delta = Math.round((ev.clientY - y) / (HOUR / 2)) * 30 * 60000;
      if (delta !== 0)
        void move(
          event,
          new Date(event.start),
          new Date(
            Math.max(
              +new Date(event.start) + 1800000,
              +new Date(event.end) + delta,
            ),
          ),
        );
      setTimeout(() => {
        resizing.current = false;
      }, 100);
    };
    const cancel = () => {
      if (block && initialHeight) block.style.height = initialHeight;
      target.removeEventListener("pointermove", update as EventListener);
      target.removeEventListener("pointerup", finish as EventListener);
      target.removeEventListener("pointercancel", cancel as EventListener);
      resizing.current = false;
    };
    target.addEventListener("pointermove", update as EventListener);
    target.addEventListener("pointerup", finish as EventListener);
    target.addEventListener("pointercancel", cancel as EventListener);
  }
  return (
    <div className="calendar-workspace">
      <PageHeading
        title="时间日历"
        description="给重要的事，留出完整的时间。"
        action={
          <Button
            onClick={() => {
              addForDay(
                view === "day"
                  ? selectedDay
                  : +startOfWeek(new Date()) === +week
                    ? new Date()
                    : week,
              );
            }}
          >
            <Plus size={17} />
            新建日程
          </Button>
        }
      />
      {query.error && (
        <div className="sync-warning" role="status">
          {query.error}
          <Button variant="outline" size="sm" onClick={query.retry}>
            重试
          </Button>
        </div>
      )}
      <div className="calendar-summary">
        <span>
          本周计划 <strong>{hours(stats.planned)}</strong> 小时
        </span>
        <span>
          已完成 <strong>{hours(stats.completed)}</strong> 小时
        </span>
        <span>
          完成率{" "}
          <strong>
            {stats.rate === null ? "—" : `${Math.round(stats.rate)}%`}
          </strong>
        </span>
        <span className="calendar-sync" role="status">
          {query.loading ? "正在更新…" : ""}
        </span>
      </div>
      <section className="calendar-panel">
        <div className="calendar-toolbar">
          <div className="week-picker">
            <h2>
              {week.getFullYear()} 年 {week.getMonth() + 1} 月
            </h2>
            <span className="muted">
              {week.getMonth() + 1}.{week.getDate()} — {days[6].getMonth() + 1}.
              {days[6].getDate()}
            </span>
            <div className="week-controls">
              <Button
                variant="outline"
                size="icon"
                aria-label="上一周"
                onClick={() => setWeek(addDays(week, -7))}
              >
                <ChevronLeft size={17} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeek(startOfWeek(new Date()))}
              >
                本周
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label="下一周"
                onClick={() => setWeek(addDays(week, 7))}
              >
                <ChevronRight size={17} />
              </Button>
            </div>
          </div>
          <div className="calendar-toolbar-actions">
            <div
              className="calendar-view-switch"
              role="group"
              aria-label="日历视图"
            >
              <button
                aria-pressed={view === "week"}
                onClick={() => setView("week")}
              >
                周视图
              </button>
              <button
                aria-pressed={view === "day"}
                onClick={() => setView("day")}
              >
                日视图
              </button>
            </div>
            <select
              aria-label="筛选日程分类"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option>全部</option>
              {eventCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="calendar-navigation">
          <label className="calendar-date-jump">
            定位日期{" "}
            <input
              type="date"
              aria-label="定位日期"
              value={dateKey(selectedDay)}
              onChange={(e) => {
                const date = new Date(`${e.target.value}T00:00:00`);
                if (isNaN(+date) || dateKey(date) !== e.target.value) return;
                setWeek(startOfWeek(date));
                setDayIndex((date.getDay() + 6) % 7);
                setView("day");
              }}
            />
          </label>
          <div
            className="calendar-time-jumps"
            role="group"
            aria-label="定位时间段"
          >
            <button onClick={() => jumpTo(0)}>凌晨</button>
            <button onClick={() => jumpTo(8)}>上午</button>
            <button onClick={() => jumpTo(13)}>下午</button>
            <button onClick={() => jumpTo(18)}>晚间</button>
            <button onClick={() => jumpTo(Math.max(0, now.getHours() - 1))}>
              当前时间
            </button>
          </div>
        </div>
        {view === "day" && (
          <div className="calendar-day-tabs" role="group" aria-label="选择日期">
            {days.map((day, i) => (
              <button
                key={dateKey(day)}
                aria-pressed={dayIndex === i}
                onClick={() => setDayIndex(i)}
              >
                周{"一二三四五六日"[i]} <strong>{day.getDate()}</strong>
              </button>
            ))}
          </div>
        )}
        <div
          className={`calendar-body ${view === "day" ? "calendar-day-view" : ""}`}
        >
          <div className="calendar-scroll" ref={scroll}>
            <div className="calendar-inner">
              <div className="calendar-days">
                <div className="timezone-label">
                  本地
                  <br />
                  时间
                </div>
                {visibleDays.map((d) => (
                  <div
                    key={dateKey(d)}
                    className={`day-heading ${dateKey(d) === dateKey(now) ? "today" : ""}`}
                  >
                    <button
                      className="day-heading-open"
                      aria-label={`查看 ${dateKey(d)} 的安排`}
                      onClick={() => {
                        setDayIndex((d.getDay() + 6) % 7);
                        setView("day");
                      }}
                    >
                      <span>周{"日一二三四五六"[d.getDay()]}</span>
                      <strong>{d.getDate()}</strong>
                    </button>
                    <button
                      className="day-heading-add"
                      aria-label={`${dateKey(d)} 添加日程`}
                      onClick={() => addForDay(d)}
                    >
                      <Plus size={14} />
                    </button>
                    <small>
                      {hours(dayLayouts[(d.getDay() + 6) % 7].planned)} 小时计划
                    </small>
                  </div>
                ))}
              </div>
              <div className="calendar-grid" style={{ height: HOUR * 24 }}>
                <div className="time-rail">
                  {Array.from({ length: 25 }, (_, hour) => (
                    <span key={hour} style={{ top: hour * HOUR }}>
                      {String(hour).padStart(2, "0")}:00
                    </span>
                  ))}
                </div>
                {visibleDays.map((day) => {
                  const { placements } = dayLayouts[(day.getDay() + 6) % 7];
                  return (
                    <div
                      key={dateKey(day)}
                      className={`day-column ${dateKey(day) === dateKey(now) ? "today-column" : ""}`}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        try {
                          const payload = JSON.parse(
                            e.dataTransfer.getData("text/plain"),
                          );
                          const event = events.find((v) => v.id === payload.id);
                          if (!event) return;
                          const rect = e.currentTarget.getBoundingClientRect();
                          const minutes = Math.max(
                            0,
                            Math.min(
                              1410,
                              Math.round(
                                (((e.clientY - rect.top) / HOUR) * 60 -
                                  payload.offset) /
                                  30,
                              ) * 30,
                            ),
                          );
                          const start = new Date(day);
                          start.setMinutes(minutes);
                          void move(
                            event,
                            start,
                            new Date(
                              +start +
                                +new Date(event.end) -
                                +new Date(event.start),
                            ),
                          );
                        } catch {
                          /* Ignore external drag data. */
                        }
                      }}
                    >
                      {Array.from({ length: 48 }, (_, slot) => (
                        <button
                          className={`time-slot ${slot % 2 ? "half-hour" : ""}`}
                          key={slot}
                          style={{ height: HOUR / 2 }}
                          aria-label={`${dateKey(day)} ${String(Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 ? "30" : "00"} 新建日程`}
                          onClick={() => {
                            const start = new Date(day);
                            start.setMinutes(slot * 30);
                            setEditor({ start });
                          }}
                        />
                      ))}
                      {placements.map(({ event, column, columns }) => {
                        const begin = new Date(
                          Math.max(+new Date(event.start), +day),
                        );
                        const end = new Date(
                          Math.min(+new Date(event.end), +addDays(day, 1)),
                        );
                        const top =
                            ((begin.getHours() * 60 + begin.getMinutes()) /
                              60) *
                            HOUR,
                          duration = (+end - +begin) / 3600000;
                        const color =
                          categoryColors[event.category] ||
                          categoryColors["自定义"];
                        return (
                          <div
                            key={event.id}
                            className={`calendar-event ${event.completed ? "event-complete" : ""}`}
                            style={
                              {
                                top,
                                height: Math.max(20, duration * HOUR - 3),
                                left: `calc(${(column * 100) / columns}% + 3px)`,
                                width: `calc(${100 / columns}% - 6px)`,
                                "--event-color": color,
                              } as React.CSSProperties
                            }
                            title={`${event.title}\n${timeLabel(event.start)} – ${timeLabel(event.end)} · ${event.category}${event.description ? `\n${event.description}` : ""}`}
                            draggable
                            onDragStart={(e) => {
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              e.dataTransfer.setData(
                                "text/plain",
                                JSON.stringify({
                                  id: event.id,
                                  offset:
                                    ((e.clientY - rect.top) / HOUR) * 60 +
                                    (+begin - +new Date(event.start)) / 60000,
                                }),
                              );
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label={`编辑日程 ${event.title}`}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setEditor({ event });
                              }
                            }}
                            onClick={() => {
                              if (!resizing.current) setEditor({ event });
                            }}
                          >
                            <strong>
                              {event.completed && <CheckCheck size={12} />}
                              {event.title}
                            </strong>
                            {duration >= 0.8 && (
                              <span>
                                {timeLabel(event.start)} –{" "}
                                {timeLabel(event.end)}
                              </span>
                            )}
                            {duration >= 1.5 && (
                              <small>
                                {event.category}
                                {event.completed ? " · 已完成" : ""}
                              </small>
                            )}
                            <span
                              className="resize-handle"
                              onPointerDown={(e) => resize(e, event)}
                              title="拖动调整时长"
                            >
                              <GripHorizontal size={13} />
                            </span>
                          </div>
                        );
                      })}
                      {dateKey(day) === dateKey(now) && (
                        <div
                          className="now-line"
                          style={{
                            top:
                              (now.getHours() + now.getMinutes() / 60) * HOUR,
                          }}
                        >
                          <span />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {view === "day" && (
            <aside className="calendar-agenda" aria-label="当日日程列表">
              <div className="calendar-agenda-heading">
                <div>
                  <h3>当天安排</h3>
                  <p>
                    {selectedDay.getMonth() + 1} 月 {selectedDay.getDate()} 日 ·{" "}
                    {dayEvents.length} 项
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addForDay(selectedDay)}
                >
                  <Plus size={14} />
                  添加
                </Button>
              </div>
              {dayEvents.length ? (
                dayEvents.map((event) => (
                  <button
                    key={event.id}
                    className="calendar-agenda-event"
                    onClick={() => setEditor({ event })}
                    style={
                      {
                        "--event-color":
                          categoryColors[event.category] ||
                          categoryColors["自定义"],
                      } as React.CSSProperties
                    }
                  >
                    <span>
                      {timeLabel(event.start)} – {timeLabel(event.end)}
                      {dateKey(new Date(event.start)) !==
                      dateKey(new Date(event.end))
                        ? " · 跨天"
                        : ""}
                    </span>
                    <strong>{event.title}</strong>
                    <small>
                      {event.category}
                      {event.completed ? " · 已完成" : " · 未完成"}
                    </small>
                    {event.description && <p>{event.description}</p>}
                  </button>
                ))
              ) : (
                <p className="calendar-agenda-empty">
                  {filter === "全部"
                    ? "这一天还没有安排，点击添加开始规划。"
                    : "当天没有这个分类的安排。"}
                </p>
              )}
            </aside>
          )}
        </div>
        <div className="calendar-legend">
          <div>
            {eventCategories.map((c) => (
              <span key={c}>
                <i style={{ background: categoryColors[c] }} />
                {c}
              </span>
            ))}
          </div>
          <span>
            <MousePointer2 size={13} />
            点击日期放大查看 · 空白处添加 · 拖动调整时间
          </span>
        </div>
      </section>
      {editor && (
        <EventEditor
          event={editor.event}
          initialStart={editor.start}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
