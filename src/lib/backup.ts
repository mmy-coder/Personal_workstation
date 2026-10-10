import { z } from "zod";
import { schemas } from "./validation";
export const backupLimit = 20 * 1024 * 1024;
const metadata = z.object({
  id: z.string().min(1).max(200),
  version: z.number().int().nonnegative().optional().default(0),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export const backupSchema = z
  .object({
    version: z.literal(1),
    exportedAt: z.string().datetime({ offset: true }),
    events: z.array(schemas.events.and(metadata)).max(10000),
    items: z.array(schemas.items.and(metadata)).max(10000),
    subscriptions: z.array(schemas.subscriptions.and(metadata)).max(10000),
    journals: z.array(schemas.journals.and(metadata)).max(10000),
    payments: z.array(schemas.payments.and(metadata)).max(10000).default([]),
  })
  .superRefine((data, ctx) => {
    for (const kind of backupKinds)
      if (new Set(data[kind].map((r) => r.id)).size !== data[kind].length)
        ctx.addIssue({
          code: "custom",
          path: [kind],
          message: "备份中存在重复记录 ID",
        });
  });
export const backupKinds = [
  "events",
  "items",
  "subscriptions",
  "journals",
  "payments",
] as const;
export const backupLabels = {
  events: "日程",
  items: "物品",
  subscriptions: "订阅",
  journals: "笔记",
  payments: "付款",
};
export type Backup = z.infer<typeof backupSchema>;
export type RestorePreview = {
  counts: Record<
    (typeof backupKinds)[number],
    { total: number; add: number; skip: number }
  >;
  safetyCopy?: string;
};
