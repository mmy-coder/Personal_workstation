import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";

export async function pagedRecords(
  resource: "items" | "subscriptions" | "payments",
  params: URLSearchParams,
) {
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
  const category = z
    .string()
    .max(120)
    .parse(params.get("category") || "");
  const status = z
    .string()
    .max(30)
    .parse(params.get("status") || "");
  const sort = z
    .enum(["最新添加", "名称排序", "金额从高到低", "续费时间"])
    .parse(params.get("sort") || "最新添加");
  const pageSize = 12;
  const common = {
    ...(category ? { category } : {}),
    ...(status ? { status } : {}),
  };
  const text = [{ name: { contains: q } }, { notes: { contains: q } }];
  return db.$transaction(async (tx) => {
    if (resource === "items") {
      const where: Prisma.ItemWhereInput = {
        ...common,
        ...(q
          ? {
              OR: [
                ...text,
                { brand: { contains: q } },
                { model: { contains: q } },
              ],
            }
          : {}),
      };
      const total = await tx.item.count({ where });
      const actualPage = Math.min(
        page,
        Math.max(1, Math.ceil(total / pageSize)),
      );
      const orderBy: Prisma.ItemOrderByWithRelationInput[] = [
        sort === "名称排序"
          ? { name: "asc" }
          : sort === "金额从高到低"
            ? { priceCents: "desc" }
            : { createdAt: "desc" },
        { id: "asc" },
      ];
      const entries = await tx.item.findMany({
        where,
        orderBy,
        take: pageSize,
        skip: (actualPage - 1) * pageSize,
      });
      return { entries, total, page: actualPage, pageSize };
    }
    if (resource === "subscriptions") {
      const where: Prisma.SubscriptionWhereInput = {
        ...common,
        ...(q ? { OR: text } : {}),
      };
      const total = await tx.subscription.count({ where });
      const actualPage = Math.min(
        page,
        Math.max(1, Math.ceil(total / pageSize)),
      );
      const orderBy: Prisma.SubscriptionOrderByWithRelationInput[] = [
        sort === "名称排序"
          ? { name: "asc" }
          : sort === "金额从高到低"
            ? { amountCents: "desc" }
            : sort === "续费时间"
              ? { nextRenewal: "asc" }
              : { createdAt: "desc" },
        { id: "asc" },
      ];
      const entries = await tx.subscription.findMany({
        where,
        orderBy,
        take: pageSize,
        skip: (actualPage - 1) * pageSize,
      });
      return { entries, total, page: actualPage, pageSize };
    }
    const where: Prisma.SubscriptionPaymentWhereInput = q ? { OR: text } : {};
    const total = await tx.subscriptionPayment.count({ where });
    const actualPage = Math.min(page, Math.max(1, Math.ceil(total / pageSize)));
    const entries = await tx.subscriptionPayment.findMany({
      where,
      orderBy: [{ paidOn: "desc" }, { id: "asc" }],
      take: pageSize,
      skip: (actualPage - 1) * pageSize,
    });
    return { entries, total, page: actualPage, pageSize };
  });
}
