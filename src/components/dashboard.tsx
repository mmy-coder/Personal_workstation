"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Plus,
  Clock3,
  CircleCheck,
  ChartNoAxesCombined,
  Wallet,
  Package,
  NotebookPen,
  CalendarDays,
  Circle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useNow } from "./clock-provider";
import { useData } from "./provider";
import { Button } from "./ui/button";
import { Empty, Metric, MoreLink, PageHeading, Panel } from "./ui/shared";
import { SeriesChart, DonutChart } from "./charts";
import { EventEditor } from "./event-editor";
import { paymentTrend } from "@/lib/renewal";
import { useJournalEditor } from "./use-journal-editor";
import { JournalEditor } from "./journal-editor";
import { AssetEditor } from "./asset-editor";
import {
  addDays,
  hours,
  money,
  monthRange,
  shortDate,
  startOfDay,
  startOfWeek,
  timeLabel,
} from "@/lib/dates";
import {
  billingInMonth,
  dailyStats,
  overlapHours,
  renewalDays,
  timeStats,
} from "@/lib/stats";
import {
  categoryColors,
  type CalendarEvent,
  type JournalEntry,
  type Item,
  type Subscription,
} from "@/lib/types";
export function Dashboard() {
  const { data, save, notify } = useData(),
    now = useNow() || new Date(),
    today = startOfDay(now),
    week = startOfWeek(now),
    [month, nextMonth] = monthRange(now);
  const [range, setRange] = useState("本周"),
    [eventEditor, setEventEditor] = useState<{ event?: CalendarEvent } | null>(
      null,
    ),
    [assetEditor, setAssetEditor] = useState<{
      kind: "items" | "subscriptions";
      record: Item | Subscription;
    } | null>(null);
  const notes = useJournalEditor();
  const journalEditor = notes.editor;
  const stats = timeStats(data.events, week, addDays(week, 7)),
    selected = timeStats(
      data.events,
      range === "本周" ? week : month,
      range === "本周" ? addDays(week, 7) : nextMonth,
    );
  const comparison = dailyStats(
    data.events,
    range === "本周" ? week : month,
    range === "本周" ? addDays(week, 7) : nextMonth,
  );
  const recentWork = dailyStats(
    data.events,
    addDays(today, -6),
    addDays(today, 1),
  );
  const monthlyBill = data.subscriptions.reduce(
    (s, sub) => s + billingInMonth(sub, month),
    0,
  );
  const todayEvents = data.events
    .filter((e) => overlapHours(e, today, addDays(today, 1)) > 0)
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));
  const upcomingEvents = data.events
    .filter((e) => !e.completed && new Date(e.start) > now)
    .sort((a, b) => +new Date(a.start) - +new Date(b.start))
    .slice(0, 3);
  const renewals = data.subscriptions
    .filter((s) => s.status === "使用中" && renewalDays(s, now) <= 7)
    .sort((a, b) => a.nextRenewal.localeCompare(b.nextRenewal))
    .slice(0, 4);
  const recentNotes = [...data.journals]
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, 3),
    recentItems = [...data.items]
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, 3);
  async function complete(event: CalendarEvent) {
    try {
      await save(
        "events",
        { completed: !event.completed },
        event.id,
        event.version,
      );
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <>
      <PageHeading
        title={`${now.getHours() < 12 ? "上午" : now.getHours() < 18 ? "下午" : "晚上"}好，让今天更有序。`}
        description="时间有安排，生活有记录。这里是你的个人空间。"
        action={
          <Button onClick={() => setEventEditor({})}>
            <Plus size={17} />
            安排时间
          </Button>
        }
      />
      <div className="overview-banner">
        <div>
          <span className="banner-icon">
            <Sparkles size={20} />
          </span>
          <span>每一小步，都在积累。</span>
        </div>
        <span>
          本周已完成 <strong>{hours(stats.completed)}</strong> 小时计划{" "}
          <span className="banner-divider">/</span> 给重要的事一点时间
        </span>
        <Link href="/calendar">
          查看本周 <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="metrics dashboard-metrics">
        <Metric
          label="本周计划时长"
          value={hours(stats.planned)}
          unit="小时"
          icon={<Clock3 />}
          hint="为重要的事预留时间"
        />
        <Metric
          label="本周已完成工作"
          value={hours(stats.workCompleted)}
          unit="小时"
          icon={<CircleCheck />}
          hint="仅统计工作分类"
        />
        <Metric
          label="本周计划完成率"
          value={stats.rate === null ? "—" : Math.round(stats.rate)}
          unit={stats.rate === null ? "" : "%"}
          icon={<ChartNoAxesCombined />}
          hint={
            stats.rate === null
              ? "本周暂无计划"
              : `全部分类已完成 ${hours(stats.completed)} 小时`
          }
        />
        <Metric
          label="本月订阅支出"
          value={money(monthlyBill)}
          icon={<Wallet />}
          hint="按当前活跃订阅预计付款"
        />
        <Metric
          label="管理中的物品"
          value={data.items.length}
          unit="件"
          icon={<Package />}
          hint="每一件拥有，都心中有数"
        />
        <Metric
          label="本月新增笔记"
          value={data.journalStats.monthCount}
          unit="篇"
          icon={<NotebookPen />}
          hint="留住值得记下的瞬间"
        />
      </div>
      <div className="section-heading">
        <h2>让日常清晰可见</h2>
        <div className="segmented" aria-label="图表时间范围">
          {["本周", "本月"].map((r) => (
            <button
              className={range === r ? "selected" : ""}
              key={r}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="two-columns chart-grid">
        <Panel
          title="工作投入"
          subtitle="最近七天 · 已完成工作时长"
          action={<span className="subtle-badge">小时</span>}
        >
          <SeriesChart
            rows={recentWork}
            series={[{ key: "工作", color: "#5577cd" }]}
          />
        </Panel>
        <Panel title="时间分配" subtitle={`${range} · 按计划时长分类`}>
          <DonutChart rows={selected.categories} />
        </Panel>
        <Panel title="计划与完成" subtitle={`${range} · 每日时长对照`}>
          <SeriesChart
            rows={comparison}
            series={[
              { key: "计划", color: "#ccd7ef" },
              { key: "完成", color: "#5577cd" },
            ]}
          />
        </Panel>
        <Panel
          title="订阅支出"
          subtitle={
            data.payments.length
              ? "实际付款历史 · 仅显示有付款记录的月份"
              : "当月预计付款 · 不含暂停和取消的订阅"
          }
          action={<span className="subtle-badge">人民币</span>}
        >
          <SeriesChart
            type="line"
            rows={
              data.payments.length
                ? paymentTrend(data.payments)
                : [
                    {
                      name: `${month.getMonth() + 1}月`,
                      预计付款: monthlyBill / 100,
                    },
                  ]
            }
            unit="元"
            series={[
              {
                key: data.payments.length ? "实际付款" : "预计付款",
                color: "#368e7b",
              },
            ]}
          />
          <p className="chart-footnote">
            {data.payments.length
              ? "按付款日期与实际金额汇总，不把未记录的月份视为零支出。"
              : "尚无支付历史，仅展示当月可计算金额，不推算过往支出。"}
          </p>
        </Panel>
      </div>
      <div className="section-heading">
        <h2>回到今天</h2>
        <span className="muted">{shortDate(now)}，保持自己的节奏</span>
      </div>
      <div className="two-columns daily-grid">
        <Panel
          title="今日时间安排"
          subtitle={`${todayEvents.length} 项日程 · ${hours(timeStats(data.events, today, addDays(today, 1)).planned)} 小时计划`}
          action={<MoreLink href="/calendar" />}
        >
          {todayEvents.length ? (
            <div className="agenda-list">
              {todayEvents.map((e) => (
                <div
                  className={`agenda-row ${e.completed ? "agenda-completed" : ""}`}
                  key={e.id}
                >
                  <button
                    className="complete-button"
                    aria-label={`${e.completed ? "取消完成" : "完成"}${e.title}`}
                    onClick={() => void complete(e)}
                  >
                    {e.completed ? (
                      <CheckCircle2 size={19} />
                    ) : (
                      <Circle size={19} />
                    )}
                  </button>
                  <span className="agenda-time">
                    {timeLabel(e.start)}
                    <small>{timeLabel(e.end)}</small>
                  </span>
                  <button
                    className="agenda-title"
                    onClick={() => setEventEditor({ event: e })}
                  >
                    <strong>{e.title}</strong>
                    <small>
                      <i
                        style={{
                          background: categoryColors[e.category] || "#87909f",
                        }}
                      />
                      {e.category}
                      {e.completed && " · 已完成"}
                    </small>
                  </button>
                  <span className="muted">
                    {hours(overlapHours(e, today, addDays(today, 1)))} h
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="今天，留白也很好"
              description="安排一件值得投入时间的事。"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEventEditor({})}
                >
                  <Plus size={14} />
                  添加今日日程
                </Button>
              }
            />
          )}
        </Panel>
        <Panel
          title="即将开始"
          subtitle="接下来的三项未完成日程"
          action={<CalendarDays size={17} className="muted" />}
        >
          {upcomingEvents.length ? (
            <div className="compact-list">
              {upcomingEvents.map((e) => (
                <button
                  className="compact-row"
                  key={e.id}
                  onClick={() => setEventEditor({ event: e })}
                >
                  <span
                    className="event-dot"
                    style={{ background: categoryColors[e.category] }}
                  />
                  <span>
                    <strong>{e.title}</strong>
                    <small>
                      {shortDate(e.start)} · {timeLabel(e.start)}–
                      {timeLabel(e.end)}
                    </small>
                  </span>
                  <span className="category-badge">{e.category}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="暂时没有接下来的安排"
              description="为明天预留一段专注的时间吧。"
            />
          )}
        </Panel>
        <Panel
          title="即将续费"
          subtitle="未来七天及已到期的活跃订阅"
          action={<MoreLink href="/assets" />}
        >
          {renewals.length ? (
            <div className="compact-list">
              {renewals.map((s) => (
                <button
                  key={s.id}
                  className="compact-row"
                  onClick={() =>
                    setAssetEditor({ kind: "subscriptions", record: s })
                  }
                >
                  <span className="item-icon">
                    <Wallet size={18} />
                  </span>
                  <span>
                    <strong>{s.name}</strong>
                    <small>
                      {s.nextRenewal} ·{" "}
                      {renewalDays(s, now) < 0
                        ? "日期已过，请核对"
                        : "即将续费"}
                    </small>
                  </span>
                  <b>{money(s.amountCents)}</b>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="近期没有待续费服务"
              description="添加订阅后，提前七天在这里提醒你。"
            />
          )}
        </Panel>
        <Panel title="最近的感悟" action={<MoreLink href="/journal" />}>
          {recentNotes.length ? (
            <div className="recent-notes">
              {recentNotes.map((j) => (
                <button key={j.id} onClick={() => void notes.open(j.id)}>
                  <div>
                    <strong>{j.title || "一段随想"}</strong>
                    <small>{shortDate(j.createdAt)}</small>
                  </div>
                  <p>{j.excerpt}</p>
                  <span>{j.tags.map((t) => `# ${t}`).join("  ")}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="把此刻的想法留下"
              description="不必长篇大论，一句话也值得被记住。"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => notes.create()}
                >
                  <PencilIcon />
                  记录一个想法
                </Button>
              }
            />
          )}
        </Panel>
        <Panel
          title="最近添加的物品"
          action={<MoreLink href="/assets" />}
          className="wide-panel"
        >
          {recentItems.length ? (
            <div className="recent-items">
              {recentItems.map((i) => (
                <button
                  key={i.id}
                  className="compact-row"
                  onClick={() => setAssetEditor({ kind: "items", record: i })}
                >
                  <span className="item-icon">
                    <Package size={20} />
                  </span>
                  <span>
                    <strong>{i.name}</strong>
                    <small>
                      {i.category} · {i.status}
                    </small>
                  </span>
                  <b>
                    {i.priceCents === null ? "未填价格" : money(i.priceCents)}
                  </b>
                </button>
              ))}
            </div>
          ) : (
            <div className="slim-empty">
              <Package size={19} />
              <span>还没有记录物品，从每天使用的那一件开始。</span>
              <Link href="/assets" className="text-link">
                添加物品 <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
        </Panel>
      </div>
      {eventEditor && (
        <EventEditor
          event={eventEditor.event}
          onClose={() => setEventEditor(null)}
        />
      )}
      {journalEditor && (
        <JournalEditor
          key={journalEditor.key}
          entry={journalEditor.entry}
          onClose={notes.close}
        />
      )}
      {assetEditor && (
        <AssetEditor {...assetEditor} onClose={() => setAssetEditor(null)} />
      )}
    </>
  );
}
function PencilIcon() {
  return <NotebookPen size={14} />;
}
