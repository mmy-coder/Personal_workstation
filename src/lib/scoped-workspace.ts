import { z } from "zod";
import { db } from "./db";
import { billingInMonth } from "./stats";
import type { AssetStats } from "./types";

const instant = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));
const bounds = z
  .object({ from: instant, to: instant })
  .refine((v) => v.from < v.to && +v.to - +v.from <= 370 * 86400000);
const day = z.iso.date();

export async function scopedWorkspace(params: URLSearchParams) {
  const scope = z
    .enum(["dashboard", "assets", "journal", "calendar"])
    .parse(params.get("scope"));
  const empty = {
    events: [],
    items: [],
    subscriptions: [],
    payments: [],
    journals: [],
    journalStats: { total: 0, favorites: 0, monthCount: 0, tags: [] },
  };
  if (scope === "calendar") return empty;
  const month = bounds.parse({
    from: params.get("month"),
    to: params.get("nextMonth"),
  });
  return db.$transaction(async (tx) => {
    const journalStats =
      scope === "journal" || scope === "dashboard"
        ? await (async () => {
            const [total, favorites, monthCount, tags] = await Promise.all([
              tx.journalEntry.count(),
              tx.journalEntry.count({ where: { favorite: true } }),
              tx.journalEntry.count({
                where: { createdAt: { gte: month.from, lt: month.to } },
              }),
              scope === "journal"
                ? tx.journalEntry.findMany({
                    select: { tags: true },
                    distinct: ["tags"],
                  })
                : Promise.resolve([]),
            ]);
            return {
              total,
              favorites,
              monthCount,
              tags: [
                ...new Set(
                  tags.flatMap((row) => JSON.parse(row.tags) as string[]),
                ),
              ].sort(),
            };
          })()
        : empty.journalStats;
    if (scope === "journal") return { ...empty, journalStats };

    const through = day.parse(params.get("renewalThrough"));
    const [itemGroups, subGroups, subscriptions] = await Promise.all([
      tx.item.groupBy({
        by: ["category", "status"],
        _count: true,
        _sum: { priceCents: true },
      }),
      tx.subscription.groupBy({
        by: ["category", "status", "cycle"],
        _count: true,
        _sum: { amountCents: true },
      }),
      tx.subscription.findMany({
        where: { status: "使用中", nextRenewal: { lte: through } },
        orderBy: [{ nextRenewal: "asc" }, { id: "asc" }],
        ...(scope === "dashboard" ? { take: 4 } : {}),
      }),
    ]);
    const counts = new Map<string, number>(),
      amounts = new Map<string, number>(),
      costs = new Map<string, number>();
    const assetStats: AssetStats = {
      items: 0,
      inUse: 0,
      idle: 0,
      purchaseCents: 0,
      subscriptions: 0,
      active: 0,
      monthlyCents: 0,
      annualCents: 0,
      itemCategories: [],
      itemAmounts: [],
      subscriptionAmounts: [],
    };
    for (const row of itemGroups) {
      const cents = row._sum.priceCents || 0;
      assetStats.items += row._count;
      assetStats.inUse += row.status === "使用中" ? row._count : 0;
      assetStats.idle += row.status === "闲置" ? row._count : 0;
      assetStats.purchaseCents += cents;
      counts.set(row.category, (counts.get(row.category) || 0) + row._count);
      amounts.set(row.category, (amounts.get(row.category) || 0) + cents / 100);
    }
    for (const row of subGroups) {
      assetStats.subscriptions += row._count;
      if (row.status !== "使用中") continue;
      const cents = row._sum.amountCents || 0;
      const monthly = cents / (row.cycle === "年付" ? 12 : 1);
      assetStats.active += row._count;
      assetStats.monthlyCents += monthly;
      assetStats.annualCents += cents * (row.cycle === "月付" ? 12 : 1);
      costs.set(row.category, (costs.get(row.category) || 0) + monthly / 100);
    }
    const rows = (map: Map<string, number>) =>
      [...map].map(([name, value]) => ({ name, value }));
    assetStats.itemCategories = rows(counts);
    assetStats.itemAmounts = rows(amounts);
    assetStats.subscriptionAmounts = rows(costs);
    if (scope === "assets") return { ...empty, assetStats, subscriptions };

    const range = bounds.parse({
      from: params.get("from"),
      to: params.get("to"),
    });
    const now = instant.parse(params.get("now"));
    const localMonth = day.parse(params.get("localMonth"));
    const [events, upcoming, items, journals, billable, paymentRows] =
      await Promise.all([
        tx.calendarEvent.findMany({
          where: { start: { lt: range.to }, end: { gt: range.from } },
          orderBy: { start: "asc" },
        }),
        tx.calendarEvent.findMany({
          where: { start: { gt: now }, completed: false },
          orderBy: [{ start: "asc" }, { id: "asc" }],
          take: 3,
        }),
        tx.item.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: 3,
        }),
        tx.journalEntry.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "asc" }],
          take: 3,
        }),
        tx.subscription.findMany({
          where: { status: "使用中" },
          select: {
            status: true,
            cycle: true,
            amountCents: true,
            startDate: true,
            nextRenewal: true,
          },
        }),
        tx.$queryRaw<
          { month: string; cents: bigint | number }[]
        >`SELECT substr("paidOn", 1, 7) AS month, SUM("amountCents") AS cents FROM "SubscriptionPayment" GROUP BY substr("paidOn", 1, 7) ORDER BY month`,
      ]);
    const [year, monthNumber] = localMonth.split("-").map(Number);
    return {
      ...empty,
      assetStats,
      journalStats,
      subscriptions,
      items,
      events: [
        ...new Map(
          [...events, ...upcoming].map((event) => [event.id, event]),
        ).values(),
      ],
      journals: journals.map(({ content, tags, ...row }) => ({
        ...row,
        tags: JSON.parse(tags),
        excerpt: content.slice(0, 300),
      })),
      monthlyBill: billable.reduce(
        (sum, sub) =>
          sum +
          billingInMonth(
            { ...sub, cycle: sub.cycle as "月付" | "年付" },
            new Date(year, monthNumber - 1, 1),
          ),
        0,
      ),
      paymentMonths: paymentRows.map((row) => ({
        name: row.month,
        实际付款: Number(row.cents) / 100,
      })),
    };
  });
}
