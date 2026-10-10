import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import type { Resource } from "./types";

const instant = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));
const rangeSchema = z
  .object({ from: instant, to: instant })
  .refine(
    (value) =>
      value.from < value.to && +value.to - +value.from <= 370 * 86400000,
    "时间范围无效或超过一年",
  );
function range(params: URLSearchParams) {
  return rangeSchema.parse({ from: params.get("from"), to: params.get("to") });
}
const journal = <T extends { tags: string }>(row: T) => ({
  ...row,
  tags: JSON.parse(row.tags) as string[],
});
const preview = <T extends { content: string; tags: string }>(row: T) => {
  const { content, ...rest } = journal(row);
  return { ...rest, excerpt: content.slice(0, 300) };
};

export async function workspaceData(params: URLSearchParams) {
  const { from, to } = range(params);
  const now = instant.parse(params.get("now"));
  const month = rangeSchema.parse({
    from: params.get("month"),
    to: params.get("nextMonth"),
  });
  const [
    events,
    upcoming,
    items,
    subscriptions,
    recent,
    total,
    favorites,
    monthCount,
    tagRows,
    payments,
  ] = await db.$transaction([
    db.calendarEvent.findMany({
      where: { start: { lt: to }, end: { gt: from } },
      orderBy: { start: "asc" },
    }),
    db.calendarEvent.findMany({
      where: { start: { gt: now }, completed: false },
      orderBy: { start: "asc" },
      take: 3,
    }),
    db.item.findMany({ orderBy: { createdAt: "desc" } }),
    db.subscription.findMany({ orderBy: { nextRenewal: "asc" } }),
    db.journalEntry.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 3,
    }),
    db.journalEntry.count(),
    db.journalEntry.count({ where: { favorite: true } }),
    db.journalEntry.count({
      where: { createdAt: { gte: month.from, lt: month.to } },
    }),
    db.journalEntry.findMany({ select: { tags: true }, distinct: ["tags"] }),
    db.subscriptionPayment.findMany({ orderBy: { paidOn: "desc" } }),
  ]);
  return {
    events: [
      ...new Map([...events, ...upcoming].map((e) => [e.id, e])).values(),
    ],
    items,
    subscriptions,
    payments,
    journals: recent.map(preview),
    journalStats: {
      total,
      favorites,
      monthCount,
      tags: [...new Set(tagRows.flatMap((row) => journal(row).tags))].sort(),
    },
  };
}

export async function listRecords(resource: Resource, params: URLSearchParams) {
  if (resource === "events") {
    const bounds =
      params.has("from") || params.has("to") ? range(params) : null;
    return db.calendarEvent.findMany({
      where: bounds
        ? { start: { lt: bounds.to }, end: { gt: bounds.from } }
        : undefined,
      orderBy: { start: "asc" },
    });
  }
  if (resource === "payments")
    return db.subscriptionPayment.findMany({ orderBy: { paidOn: "desc" } });
  if (resource === "items")
    return db.item.findMany({ orderBy: { createdAt: "desc" } });
  if (resource === "subscriptions")
    return db.subscription.findMany({ orderBy: { nextRenewal: "asc" } });
  if (!params.has("page"))
    return (
      await db.journalEntry.findMany({ orderBy: { createdAt: "desc" } })
    ).map(journal);

  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(1000000)
    .parse(params.get("page"));
  const q = z
    .string()
    .max(200)
    .parse(params.get("q") || "")
    .trim();
  const tag = z
    .string()
    .max(40)
    .parse(params.get("tag") || "");
  const sort = z
    .enum(["最近创建", "最近修改", "最早创建"])
    .parse(params.get("sort") || "最近创建");
  const where: Prisma.JournalEntryWhereInput = {
    ...(q
      ? {
          OR: [
            { title: { contains: q } },
            { content: { contains: q } },
            { tags: { contains: q } },
          ],
        }
      : {}),
    ...(tag ? { tags: { contains: JSON.stringify(tag) } } : {}),
    ...(params.get("favorite") === "true" ? { favorite: true } : {}),
  };
  const pageSize = 12;
  return db.$transaction(async (tx) => {
    const total = await tx.journalEntry.count({ where });
    const actualPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
    const rows = await tx.journalEntry.findMany({
      where,
      take: pageSize,
      skip: (actualPage - 1) * pageSize,
      orderBy: [
        { pinned: "desc" },
        sort === "最近修改"
          ? { updatedAt: "desc" }
          : { createdAt: sort === "最早创建" ? "asc" : "desc" },
        { id: "asc" },
      ],
    });
    return { entries: rows.map(preview), total, page: actualPage, pageSize };
  });
}

export function queryError(error: unknown) {
  if (error instanceof z.ZodError)
    return Response.json(
      { error: "查询条件无效，请调整范围或关键词后重试。" },
      { status: 400 },
    );
  console.error(error);
  return Response.json({ error: "读取失败，请稍后重试。" }, { status: 500 });
}
