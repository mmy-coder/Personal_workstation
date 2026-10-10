import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import {
  backupKinds,
  backupLimit,
  backupSchema,
  type RestorePreview,
} from "@/lib/backup";
import { z } from "zod";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (
        new URL(origin).host !== request.headers.get("host") ||
        !/^https?:$/.test(new URL(origin).protocol)
      )
        return Response.json({ error: "不允许跨站恢复" }, { status: 403 });
    } catch {
      return Response.json({ error: "来源无效" }, { status: 403 });
    }
  }
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > backupLimit)
      return Response.json({ error: "备份不能超过 20 MB" }, { status: 413 });
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      return Response.json({ error: "文件不是有效 JSON" }, { status: 400 });
    }
    const { mode, backup } = z
      .object({ mode: z.enum(["preview", "restore"]), backup: backupSchema })
      .parse(input);
    const result = await db.$transaction(
      async (tx) => {
        const [events, items, subscriptions, journalRows, links, payments] =
          await Promise.all([
            tx.calendarEvent.findMany(),
            tx.item.findMany(),
            tx.subscription.findMany(),
            tx.journalEntry.findMany(),
            tx.backupRestoreLink.findMany(),
            tx.subscriptionPayment.findMany(),
          ]);
        const current = {
          events,
          payments,
          items,
          subscriptions,
          journals: journalRows.map((j) => ({
            ...j,
            tags: JSON.parse(j.tags) as string[],
          })),
        };
        const mapping = new Map(
          links.map((link) => [link.sourceKey, link.targetId]),
        );
        const counts = {} as RestorePreview["counts"];
        const missing = {
          events: [] as typeof backup.events,
          items: [] as typeof backup.items,
          subscriptions: [] as typeof backup.subscriptions,
          journals: [] as typeof backup.journals,
          payments: [] as typeof backup.payments,
        };
        for (const kind of backupKinds) {
          const ids = new Set(current[kind].map((row) => row.id));
          for (const row of backup[kind]) {
            const target = mapping.get(JSON.stringify([kind, row.id]));
            if (!ids.has(row.id) && !(target && ids.has(target)))
              (missing[kind] as { id: string }[]).push(row);
          }
          counts[kind] = {
            total: backup[kind].length,
            add: missing[kind].length,
            skip: backup[kind].length - missing[kind].length,
          };
        }
        if (
          mode === "preview" ||
          !backupKinds.some((kind) => missing[kind].length)
        )
          return { counts };
        // Save a readable snapshot before any writes. A failed snapshot aborts recovery.
        const database = process.env.DATABASE_URL || "file:./personal.db";
        if (!database.startsWith("file:"))
          throw new Error("恢复功能目前仅支持本地 SQLite");
        const databasePath = path.resolve(
          process.cwd(),
          "prisma",
          database.slice(5),
        );
        const directory = path.join(
          path.dirname(databasePath),
          "backups",
          path.basename(databasePath),
        );
        await mkdir(directory, { recursive: true });
        const filename = `before-restore-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.json`;
        await writeFile(
          path.join(directory, filename),
          JSON.stringify(
            { version: 1, exportedAt: new Date().toISOString(), ...current },
            null,
            2,
          ),
          { flag: "wx", mode: 0o600 },
        );
        for (const kind of backupKinds)
          for (const row of missing[kind]) {
            // New identities prevent an old editor from writing to a resurrected record.
            const id = randomUUID();
            const data = {
              ...row,
              id,
              version: 0,
              createdAt: new Date(row.createdAt),
              updatedAt: new Date(row.updatedAt),
            };
            if (kind === "events") {
              const event = data as typeof data & {
                start: string;
                end: string;
              };
              await tx.calendarEvent.create({
                data: {
                  ...event,
                  start: new Date(event.start),
                  end: new Date(event.end),
                } as Parameters<typeof tx.calendarEvent.create>[0]["data"],
              });
            } else if (kind === "items")
              await tx.item.create({
                data: data as Parameters<typeof tx.item.create>[0]["data"],
              });
            else if (kind === "subscriptions")
              await tx.subscription.create({
                data: data as Parameters<
                  typeof tx.subscription.create
                >[0]["data"],
              });
            else if (kind === "payments") {
              const payment = data as typeof data & { subscriptionId: string };
              const originalExists = subscriptions.some(
                (sub) => sub.id === payment.subscriptionId,
              );
              const subscriptionId = originalExists
                ? payment.subscriptionId
                : mapping.get(
                    JSON.stringify(["subscriptions", payment.subscriptionId]),
                  ) || payment.subscriptionId;
              await tx.subscriptionPayment.create({
                data: { ...payment, subscriptionId } as Parameters<
                  typeof tx.subscriptionPayment.create
                >[0]["data"],
              });
            } else {
              const note = data as typeof data & { tags: string[] };
              await tx.journalEntry.create({
                data: {
                  ...note,
                  tags: JSON.stringify(note.tags),
                } as Parameters<typeof tx.journalEntry.create>[0]["data"],
              });
            }
            mapping.set(JSON.stringify([kind, row.id]), id);
            await tx.backupRestoreLink.upsert({
              where: { sourceKey: JSON.stringify([kind, row.id]) },
              create: {
                sourceKey: JSON.stringify([kind, row.id]),
                targetId: id,
              },
              update: { targetId: id },
            });
          }
        return {
          counts,
          safetyCopy: path.relative(
            process.cwd(),
            path.join(directory, filename),
          ),
        };
      },
      { maxWait: 10000, timeout: 60000 },
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError)
      return Response.json(
        {
          error: `备份校验失败：${error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".")} ${i.message}`)
            .join("；")}`,
        },
        { status: 400 },
      );
    console.error(error);
    return Response.json(
      {
        error: "恢复未完成，数据库写入已回滚。请检查文件权限与本地服务后重试。",
      },
      { status: 500 },
    );
  }
}
