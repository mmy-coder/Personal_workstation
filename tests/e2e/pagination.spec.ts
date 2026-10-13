import { test, expect, type APIRequestContext } from "@playwright/test";
import { workspaceURL } from "../../src/lib/workspace-url";

test.beforeEach(async ({ request }) => {
  const data = await (await request.get("/api/data")).json();
  for (const kind of [
    "events",
    "items",
    "subscriptions",
    "journals",
    "payments",
  ])
    for (const row of data[kind]) {
      const result = await request.delete(`/api/${kind}/${row.id}`, {
        headers: { "If-Match": String(row.version) },
      });
      expect(result.ok()).toBe(true);
    }
});

async function create(
  request: APIRequestContext,
  resource: string,
  data: unknown,
) {
  const response = await request.post(`/api/${resource}`, { data });
  expect(response.status()).toBe(201);
  return response.json();
}

test("资产分页与全局统计独立，搜索覆盖其他页，删除末页自动回退", async ({
  page,
  request,
}) => {
  for (let i = 1; i <= 25; i++)
    await create(request, "items", {
      name: `分页物品 ${String(i).padStart(2, "0")}`,
      category: i % 2 ? "数码设备" : "书籍",
      priceCents: i * 100,
      purchaseDate: null,
      brand: "",
      model: "",
      status: i === 1 ? "闲置" : "使用中",
      notes: i === 25 ? "隐藏搜索词" : "",
      imageUrl: "",
    });
  const summary = await (
    await request.get(workspaceURL(new Date(), "assets"))
  ).json();
  expect(summary.items).toEqual([]);
  expect(summary.payments).toEqual([]);
  expect(summary.assetStats).toMatchObject({
    items: 25,
    inUse: 24,
    idle: 1,
    purchaseCents: 32500,
  });
  expect(
    summary.assetStats.itemCategories.reduce(
      (sum: number, row: { value: number }) => sum + row.value,
      0,
    ),
  ).toBe(25);
  await page.goto("/assets?sort=" + encodeURIComponent("名称排序"));
  const table = page.locator(".records-panel tbody tr");
  const pager = page.getByRole("navigation", { name: "资产分页" });
  await expect(table).toHaveCount(12);
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "物品总数" })
      .locator(".metric-value"),
  ).toHaveText("25件");
  await pager.getByRole("button", { name: "下一页" }).click();
  await expect(pager).toContainText("第 2 / 3 页");
  await page.reload();
  await expect(pager).toContainText("第 2 / 3 页");
  await page.getByLabel("搜索记录", { exact: true }).fill("隐藏搜索词");
  await expect(table).toHaveCount(1);
  await expect(table).toContainText("分页物品 25");
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "物品总数" })
      .locator(".metric-value"),
  ).toHaveText("25件");
  await page.getByLabel("搜索记录", { exact: true }).fill("");
  await expect(table).toHaveCount(12);
  await pager.getByRole("button", { name: "下一页" }).click();
  await expect(pager).toContainText("第 2 / 3 页");
  await pager.getByRole("button", { name: "下一页" }).click();
  await expect(table).toHaveCount(1);
  const last = await (
    await request.get(
      "/api/items?page=3&sort=" + encodeURIComponent("名称排序"),
    )
  ).json();
  await request.delete(`/api/items/${last.entries[0].id}`, {
    headers: { "If-Match": String(last.entries[0].version) },
  });
  await page.reload();
  await expect(pager).toContainText("第 2 / 2 页");
  await expect(table).toHaveCount(12);
  expect((await (await request.get("/api/data")).json()).items).toHaveLength(
    24,
  );
  expect((await request.get("/api/items?page=0")).status()).toBe(400);
  const scoped = await (
    await request.get(workspaceURL(new Date(), "dashboard"))
  ).json();
  expect(scoped.items).toHaveLength(3);
  expect(scoped.assetStats.items).toBe(24);
});

test("付款分页保留所有月份统计，订阅筛选不改变总成本", async ({
  page,
  request,
}) => {
  let sub = await create(request, "subscriptions", {
    name: "分页云盘",
    category: "云服务",
    amountCents: 1200,
    cycle: "月付",
    startDate: "2024-01-01",
    nextRenewal: "2025-01-01",
    status: "使用中",
    notes: "",
  });
  for (let i = 0; i < 13; i++) {
    const nextRenewal =
      i === 11
        ? "2026-01-01"
        : i === 12
          ? "2026-02-01"
          : `2025-${String(i + 2).padStart(2, "0")}-01`;
    const response = await request.post(`/api/subscriptions/${sub.id}/renew`, {
      headers: { "Idempotency-Key": `pagination-${sub.id}-${i}` },
      data: {
        version: sub.version,
        amountCents: 1200,
        paidOn: i < 6 ? "2025-01-01" : "2025-02-01",
        nextRenewal,
        notes: "",
      },
    });
    expect(response.ok()).toBe(true);
    sub = (await response.json()).subscription;
  }
  await create(request, "subscriptions", {
    name: "暂停年付",
    category: "效率工具",
    amountCents: 99900,
    cycle: "年付",
    startDate: "2024-01-01",
    nextRenewal: "2027-01-01",
    status: "已暂停",
    notes: "",
  });
  const summary = await (
    await request.get(workspaceURL(new Date(), "dashboard"))
  ).json();
  expect(summary.payments).toEqual([]);
  expect(summary.paymentMonths).toEqual([
    { name: "2025-01", 实际付款: 72 },
    { name: "2025-02", 实际付款: 84 },
  ]);
  expect(summary.assetStats).toMatchObject({
    subscriptions: 2,
    active: 1,
    monthlyCents: 1200,
    annualCents: 14400,
  });
  await page.goto("/assets?tab=subscriptions");
  const pager = page.getByRole("navigation", { name: "付款分页" });
  await expect(pager).toContainText("第 1 / 2 页");
  await pager.getByRole("button", { name: "下一页" }).click();
  await expect(
    page.getByRole("button", { name: "编辑付款", exact: true }),
  ).toHaveCount(1);
  await page.getByLabel("状态筛选", { exact: true }).selectOption("已暂停");
  await expect(page.locator(".records-panel tbody tr")).toHaveCount(1);
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "月均订阅成本" })
      .locator(".metric-value"),
  ).toContainText("12.00");
  const journal = await (
    await request.get(workspaceURL(new Date(), "journal"))
  ).json();
  for (const kind of ["events", "items", "subscriptions", "payments"])
    expect(journal[kind]).toEqual([]);
  expect(await (await request.get("/api/payments")).json()).toHaveLength(13);
});
