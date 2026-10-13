import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";

async function item(request: APIRequestContext, name: string) {
  const response = await request.post("/api/items", {
    data: {
      name,
      category: "数码设备",
      priceCents: null,
      purchaseDate: null,
      brand: "",
      model: "",
      status: "使用中",
      notes: "",
      imageUrl: "",
    },
  });
  expect(response.status()).toBe(201);
  return response.json();
}
test.beforeEach(async ({ request }) => {
  const data = await (await request.get("/api/data")).json();
  for (const kind of [
    "items",
    "subscriptions",
    "events",
    "journals",
    "payments",
  ])
    for (const record of data[kind])
      expect(
        (
          await request.delete(`/api/${kind}/${record.id}`, {
            headers: { "If-Match": String(record.version) },
          })
        ).ok(),
      ).toBeTruthy();
});

test("批量版本冲突整批回滚，重试幂等且拒绝重复或不适用操作", async ({
  request,
}) => {
  const first = await item(request, "批量甲");
  const second = await item(request, "批量乙");
  await request.patch(`/api/items/${second.id}`, {
    headers: { "If-Match": "0" },
    data: { notes: "另一个窗口" },
  });
  const data = {
    resource: "items",
    records: [first, second].map(({ id, version }) => ({ id, version })),
    operation: { action: "status", value: "闲置" },
  };
  const headers = { "Idempotency-Key": randomUUID() };
  expect((await request.post("/api/bulk", { data, headers })).status()).toBe(
    409,
  );
  expect(
    (await (await request.get(`/api/items/${first.id}`)).json()).status,
  ).toBe("使用中");
  const deletion = { ...data, operation: { action: "delete" } };
  expect(
    (await request.post("/api/bulk", { data: deletion, headers })).status(),
  ).toBe(409);
  expect((await request.get(`/api/items/${first.id}`)).status()).toBe(200);
  data.records[1].version = 1;
  expect(
    (await request.post("/api/bulk", { data, headers })).ok(),
  ).toBeTruthy();
  expect(
    (await request.post("/api/bulk", { data, headers })).ok(),
  ).toBeTruthy();
  const changed = await (await request.get(`/api/items/${first.id}`)).json();
  expect(changed.status).toBe("闲置");
  expect(changed.version).toBe(1);
  expect(
    (
      await request.post("/api/bulk", {
        data: { ...data, records: [data.records[0], data.records[0]] },
        headers: { "Idempotency-Key": randomUUID() },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/bulk", {
        data: { ...data, operation: { action: "complete", value: true } },
        headers: { "Idempotency-Key": randomUUID() },
      })
    ).status(),
  ).toBe(400);
  expect((await request.post("/api/bulk", { data })).status()).toBe(428);
  expect(
    (
      await request.post("/api/bulk", {
        data,
        headers: { ...headers, Origin: "https://other.example" },
      })
    ).status(),
  ).toBe(403);
});

test("资产批量管理要求确认，修改及删除后刷新列表", async ({
  page,
  request,
}) => {
  await item(request, "批量物品一");
  await item(request, "批量物品二");
  await page.goto("/assets");
  await page.getByRole("button", { name: "批量管理本页" }).click();
  await page.getByLabel("全选本批记录", { exact: false }).check();
  await page.getByLabel("批量操作", { exact: true }).selectOption("status");
  await page.getByLabel("目标值", { exact: true }).selectOption("闲置");
  const submit = page.getByRole("button", { name: "确认批量修改 2 条" });
  await expect(submit).toBeDisabled();
  await page.getByLabel("我已核对所选", { exact: false }).check();
  await submit.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".records-panel tbody").getByText("闲置", { exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "批量管理本页" }).click();
  await page.getByLabel("全选本批记录", { exact: false }).check();
  await page.getByLabel("批量操作", { exact: true }).selectOption("delete");
  await page.getByLabel("我已核对所选", { exact: false }).check();
  await page.getByRole("button", { name: "确认批量删除 2 条" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await (await request.get("/api/items")).json()).length).toBe(0);
});

test("日历批量完成与订阅批量暂停", async ({ page, request }) => {
  for (const title of ["批量日程一", "批量日程二"]) {
    const date = new Date();
    date.setHours(10, 0, 0, 0);
    expect(
      (
        await request.post("/api/events", {
          data: {
            title,
            description: "",
            category: "工作",
            start: date.toISOString(),
            end: new Date(+date + 3600000).toISOString(),
            completed: false,
          },
        })
      ).status(),
    ).toBe(201);
  }
  await page.goto("/calendar");
  await page.getByRole("button", { name: "批量管理日程" }).click();
  await page.getByLabel("全选本批记录", { exact: false }).check();
  await page.getByLabel("批量操作", { exact: true }).selectOption("complete");
  await page.getByLabel("我已核对所选", { exact: false }).check();
  await page.getByRole("button", { name: "确认批量修改 2 条" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await (await request.get("/api/events")).json()).every(
      (event: { completed: boolean }) => event.completed,
    ),
  ).toBeTruthy();
  const sub = await (
    await request.post("/api/subscriptions", {
      data: {
        name: "批量订阅",
        category: "效率工具",
        amountCents: 100,
        cycle: "月付",
        startDate: "2026-01-01",
        nextRenewal: "2026-11-01",
        status: "使用中",
        notes: "",
      },
    })
  ).json();
  const body = {
    resource: "subscriptions",
    records: [{ id: sub.id, version: sub.version }],
    operation: { action: "status", value: "已暂停" },
  };
  expect(
    (
      await request.post("/api/bulk", {
        data: body,
        headers: { "Idempotency-Key": randomUUID() },
      })
    ).ok(),
  ).toBeTruthy();
  expect(
    (await (await request.get(`/api/subscriptions/${sub.id}`)).json()).status,
  ).toBe("已暂停");
});

test("设置内创建备份、下载和恢复预览，备份轮换不影响数据", async ({
  page,
  request,
}) => {
  await item(request, "备份中的物品");
  expect(
    (
      await request.patch("/api/backups", {
        data: { enabled: false, intervalHours: 24, retain: 2 },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/assets");
  await page.getByRole("button", { name: "设置与数据" }).click();
  await page.getByLabel("保留份数", { exact: true }).fill("2");
  await page.getByRole("button", { name: "保存备份设置" }).click();
  await expect(
    page.getByText("备份设置已保存。", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "立即备份" }).click();
  await expect(
    page.getByText("备份已保存到本机。", { exact: true }),
  ).toBeVisible();
  await page.locator("summary").filter({ hasText: "本机备份" }).click();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("link", { name: /KB · 下载/ })
    .first()
    .click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^auto-.*\.json$/);
  for (let i = 0; i < 2; i++)
    expect((await request.post("/api/backups")).ok()).toBeTruthy();
  const status = await (await request.get("/api/backups")).json();
  expect(status.files).toHaveLength(2);
  const backup = await (
    await request.get(`/api/backups?file=${status.files[0].name}`)
  ).json();
  expect(backup.items[0].name).toBe("备份中的物品");
  expect(
    (
      await request.post("/api/backup", { data: { mode: "preview", backup } })
    ).ok(),
  ).toBeTruthy();
  expect(
    (await request.get("/api/backups?file=..%2Fsettings.json")).status(),
  ).toBe(404);
  expect(
    (
      await request.post("/api/backups", {
        headers: { Origin: "https://other.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.patch("/api/backups", {
        data: { enabled: true, intervalHours: 0, retain: 0 },
      })
    ).status(),
  ).toBe(400);
});
