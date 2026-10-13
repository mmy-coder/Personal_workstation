import { z } from "zod";
export type BulkResource = "items" | "subscriptions" | "events";
export type BulkRecord = {
  id: string;
  version: number;
  name?: string;
  title?: string;
};
export const bulkSchema = z
  .object({
    resource: z.enum(["items", "subscriptions", "events"]),
    records: z
      .array(
        z
          .object({
            id: z.string().min(1).max(200),
            version: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(100)
      .refine(
        (records) =>
          new Set(records.map((record) => record.id)).size === records.length,
        "不能重复选择记录",
      ),
    operation: z.discriminatedUnion("action", [
      z.object({ action: z.literal("delete") }).strict(),
      z
        .object({
          action: z.literal("category"),
          value: z.string().trim().min(1).max(120),
        })
        .strict(),
      z
        .object({
          action: z.literal("status"),
          value: z.enum([
            "使用中",
            "闲置",
            "已出售",
            "已丢弃",
            "已暂停",
            "已取消",
          ]),
        })
        .strict(),
      z.object({ action: z.literal("complete"), value: z.boolean() }).strict(),
    ]),
  })
  .strict()
  .superRefine(({ resource, operation }, ctx) => {
    if (
      (operation.action === "complete" && resource !== "events") ||
      (operation.action === "status" &&
        (resource === "events" ||
          !(
            resource === "items"
              ? ["使用中", "闲置", "已出售", "已丢弃"]
              : ["使用中", "已暂停", "已取消"]
          ).includes(operation.value))) ||
      (operation.action === "category" &&
        resource === "events" &&
        operation.value.length > 30)
    )
      ctx.addIssue({
        code: "custom",
        message: "该操作不适用于所选记录",
        path: ["operation"],
      });
  });
