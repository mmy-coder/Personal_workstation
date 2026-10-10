import { Prisma } from "@prisma/client";
import { once, OperationError } from "./idempotency";
import { db } from "./db";
import { schemas } from "./validation";
import type { Resource } from "./types";
export function isResource(value: string): value is Resource {
  return Object.hasOwn(schemas, value);
}
export async function allData() {
  const [events, items, subscriptions, journals, payments] =
    await db.$transaction([
      db.calendarEvent.findMany({ orderBy: { start: "asc" } }),
      db.item.findMany({ orderBy: { createdAt: "desc" } }),
      db.subscription.findMany({ orderBy: { nextRenewal: "asc" } }),
      db.journalEntry.findMany({ orderBy: { createdAt: "desc" } }),
      db.subscriptionPayment.findMany({ orderBy: { paidOn: "desc" } }),
    ]);
  return {
    events,
    payments,
    items,
    subscriptions,
    journals: journals.map((j) => ({
      ...j,
      tags: JSON.parse(j.tags) as string[],
    })),
  };
}
export async function getRecord(resource: Resource, id: string) {
  const row =
    resource === "events"
      ? await db.calendarEvent.findUnique({ where: { id } })
      : resource === "items"
        ? await db.item.findUnique({ where: { id } })
        : resource === "subscriptions"
          ? await db.subscription.findUnique({ where: { id } })
          : resource === "payments"
            ? await db.subscriptionPayment.findUnique({ where: { id } })
            : await db.journalEntry.findUnique({ where: { id } });
  if (!row) return null;
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...("start" in row
      ? { start: row.start.toISOString(), end: row.end.toISOString() }
      : {}),
    ...("tags" in row ? { tags: JSON.parse(row.tags) as string[] } : {}),
  };
}

function missing() {
  return Response.json(
    { error: "记录不存在，可能已被删除。你的输入仍保留。" },
    { status: 404 },
  );
}
function conflict() {
  return Response.json(
    {
      error:
        "这条记录已在其他窗口修改。你的输入仍保留，请先查看最新版本；笔记也可以另存为新笔记。",
    },
    { status: 409 },
  );
}

export async function mutate(request: Request, resource: string, id?: string) {
  if (!isResource(resource))
    return Response.json({ error: "记录类型不存在" }, { status: 404 });
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (
        new URL(origin).host !== request.headers.get("host") ||
        !["http:", "https:"].includes(new URL(origin).protocol)
      )
        return Response.json({ error: "不允许跨站写入" }, { status: 403 });
    } catch {
      return Response.json({ error: "来源无效" }, { status: 403 });
    }
  }
  try {
    const current = id ? await getRecord(resource, id) : null;
    if (id && !current) return missing();
    const token = request.headers.get("if-match");
    if (id && (token === null || !/^\d+$/.test(token)))
      return Response.json(
        { error: "缺少记录版本，请重新打开记录后重试。" },
        { status: 428 },
      );
    const version = Number(token);
    if (current && current.version !== version) return conflict();
    // The version predicate and increment run in the same database statement.
    const where = { id: id!, version };
    if (request.method === "DELETE" && id) {
      if (resource === "events") await db.calendarEvent.delete({ where });
      if (resource === "items") await db.item.delete({ where });
      if (resource === "subscriptions") await db.subscription.delete({ where });
      if (resource === "journals") await db.journalEntry.delete({ where });
      if (resource === "payments")
        await db.subscriptionPayment.delete({ where });
      return Response.json({ ok: true });
    }
    const raw = await request.text();
    if (raw.length > 500000)
      return Response.json({ error: "内容过大" }, { status: 413 });
    let patch: unknown;
    try {
      patch = JSON.parse(raw);
    } catch {
      return Response.json({ error: "请求格式无效" }, { status: 400 });
    }
    if (!patch || typeof patch !== "object" || Array.isArray(patch))
      return Response.json({ error: "请求必须是记录对象" }, { status: 400 });
    if (!id) {
      const validated = schemas[resource].parse(patch);
      const result = await once(
        request.headers.get("idempotency-key"),
        `create:${resource}`,
        validated,
        async (tx) => {
          if (resource === "events")
            return tx.calendarEvent.create({
              data: schemas.events.parse(validated),
            });
          if (resource === "items")
            return tx.item.create({ data: schemas.items.parse(validated) });
          if (resource === "subscriptions")
            return tx.subscription.create({
              data: schemas.subscriptions.parse(validated),
            });
          if (resource === "payments")
            throw new OperationError("请从订阅的确认续费入口记录付款。", 400);
          const value = schemas.journals.parse(validated);
          const row = await tx.journalEntry.create({
            data: { ...value, tags: JSON.stringify(value.tags) },
          });
          return { ...row, tags: value.tags };
        },
      );
      const current = await getRecord(resource, result.id);
      if (!current)
        throw new OperationError(
          "这次创建已完成，但记录之后已被删除；重试不会重新创建。",
          409,
        );
      return Response.json(current, { status: 201 });
    }
    // PATCH validates the merged record, so date and other cross-field constraints still apply.
    const body = { ...current, ...patch };
    let result;
    if (resource === "events") {
      const data = schemas.events.parse(body);
      result = id
        ? await db.calendarEvent.update({
            where,
            data: { ...data, version: { increment: 1 } },
          })
        : await db.calendarEvent.create({ data });
    }
    if (resource === "items") {
      const data = schemas.items.parse(body);
      result = id
        ? await db.item.update({
            where,
            data: { ...data, version: { increment: 1 } },
          })
        : await db.item.create({ data });
    }
    if (resource === "subscriptions") {
      const data = schemas.subscriptions.parse(body);
      if (
        current &&
        "nextRenewal" in current &&
        current.nextRenewal !== data.nextRenewal
      )
        data.renewalAnchorDay = Number(data.nextRenewal.slice(-2));
      result = id
        ? await db.subscription.update({
            where,
            data: { ...data, version: { increment: 1 } },
          })
        : await db.subscription.create({ data });
    }
    if (resource === "payments") {
      const data = schemas.payments.parse(body);
      result = await db.subscriptionPayment.update({
        where,
        data: { ...data, version: { increment: 1 } },
      });
    }
    if (resource === "journals") {
      const value = schemas.journals.parse(body);
      const data = { ...value, tags: JSON.stringify(value.tags) };
      const row = id
        ? await db.journalEntry.update({
            where,
            data: { ...data, version: { increment: 1 } },
          })
        : await db.journalEntry.create({ data });
      result = { ...row, tags: JSON.parse(row.tags) };
    }
    return Response.json(result, { status: id ? 200 : 201 });
  } catch (error) {
    if (error instanceof OperationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error && typeof error === "object" && "issues" in error)
      return Response.json(
        {
          error: (error.issues as { message: string }[])
            .map((i) => i.message)
            .join("；"),
        },
        { status: 400 },
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    )
      return id && (await getRecord(resource, id)) ? conflict() : missing();
    console.error(error);
    return Response.json(
      { error: "保存失败，请稍后重试。你的输入仍保留在表单中。" },
      { status: 500 },
    );
  }
}
