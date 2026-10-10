import { test, expect, type APIRequestContext } from "@playwright/test";
import { addDays, dateKey, startOfWeek } from "../../src/lib/dates";
const journal = {
  title: "旧笔记",
  content: "绝不能被新笔记覆盖",
  tags: [],
  pinned: false,
  favorite: false,
};
async function createSub(request: APIRequestContext) {
  return (
    await request.post("/api/subscriptions", {
      data: {
        name: "续费云空间",
        category: "云服务",
        amountCents: 3000,
        cycle: "月付",
        startDate: "2025-01-01",
        nextRenewal: "2026-01-31",
        status: "使用中",
        notes: "",
      },
    })
  ).json();
}
test.beforeEach(async ({ request }) => {
  const data = await (await request.get("/api/data")).json();
  for (const kind of [
    "events",
    "items",
    "subscriptions",
    "journals",
    "payments",
  ])
    for (const row of data[kind])
      await request.delete(`/api/${kind}/${row.id}`, {
        headers: { "If-Match": String(row.version) },
      });
});

test("旧笔记慢请求不能改变后来打开的新笔记目标", async ({ page, request }) => {
  const old = await (
    await request.post("/api/journals", { data: journal })
  ).json();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/journals/${old.id}`, async (route) => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.goto("/journal");
  await page.locator(".note-body").click();
  await expect(page.getByText("正在打开笔记…")).toBeVisible();
  await page
    .getByRole("button", { name: "记录一个想法", exact: true })
    .first()
    .click();
  await page.getByLabel("笔记正文", { exact: true }).fill("这是独立的新想法");
  release();
  await expect(page.getByRole("dialog")).toContainText("记录一个想法");
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const rows = await (await request.get("/api/journals")).json();
  expect(rows).toHaveLength(2);
  expect(rows.find((row: { id: string }) => row.id === old.id).content).toBe(
    journal.content,
  );
});

test("创建已提交但响应丢失，刷新后重试仍只有一条记录", async ({
  page,
  request,
}) => {
  let lost = false;
  await page.route("**/api/journals", async (route) => {
    if (route.request().method() !== "POST" || lost) return route.continue();
    lost = true;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    await route.abort("failed");
  });
  await page.goto("/journal");
  await page
    .getByRole("button", { name: "记录一个想法", exact: true })
    .first()
    .click();
  await page
    .getByLabel("笔记正文", { exact: true })
    .fill("网络重试只能保存一次");
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(page.locator(".form-error")).toContainText("连接失败");
  expect(await (await request.get("/api/journals")).json()).toHaveLength(1);
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  await page.reload();
  await page
    .getByRole("button", { name: "记录一个想法", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("笔记正文", { exact: true })).toHaveValue(
    "网络重试只能保存一次",
  );
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await (await request.get("/api/journals")).json()).toHaveLength(1);
});

test("相同请求标识的并发创建返回相同记录，内容不同拒绝复用", async ({
  request,
}) => {
  const key = crypto.randomUUID();
  const responses = await Promise.all(
    [1, 2].map(() =>
      request.post("/api/journals", {
        data: journal,
        headers: { "Idempotency-Key": key },
      }),
    ),
  );
  expect(responses.map((r) => r.status())).toEqual([201, 201]);
  const rows = await Promise.all(responses.map((r) => r.json()));
  expect(rows[0].id).toBe(rows[1].id);
  expect(
    (
      await request.post("/api/journals", {
        data: { ...journal, content: "不同内容" },
        headers: { "Idempotency-Key": key },
      })
    ).status(),
  ).toBe(409);
  await request.delete(`/api/journals/${rows[0].id}`, {
    headers: { "If-Match": "0" },
  });
  expect(
    (
      await request.post("/api/journals", {
        data: journal,
        headers: { "Idempotency-Key": key },
      })
    ).status(),
  ).toBe(409);
  expect(await (await request.get("/api/journals")).json()).toHaveLength(0);
});

test("草稿箱能找回已删除笔记的草稿，并整理重复副本", async ({
  page,
  request,
}) => {
  await page.goto("/journal");
  await expect(
    page.getByRole("heading", { name: "感悟笔记", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const form = {
      title: "遗留草稿",
      content: "原笔记删除后仍可找回",
      tags: "成长",
      pinned: false,
      favorite: false,
    };
    localStorage.setItem(
      "personal-os-draft-deleted-record",
      JSON.stringify(form),
    );
    const duplicate = {
      format: 1,
      basedOnVersion: null,
      savedAt: "2026-10-01T00:00:00Z",
      form: { ...form, title: "重复副本" },
    };
    localStorage.setItem(
      "personal-os-draft-v2:new:closed:a",
      JSON.stringify(duplicate),
    );
    localStorage.setItem(
      "personal-os-draft-v2:new:closed:b",
      JSON.stringify({ ...duplicate, savedAt: "2026-10-02T00:00:00Z" }),
    );
  });
  await page.getByRole("button", { name: "草稿箱", exact: true }).click();
  await expect(page.locator(".draft-box-toolbar")).toContainText(
    "1 份重复副本",
  );
  await page.getByRole("button", { name: "整理重复草稿" }).click();
  await page.getByRole("button", { name: "确认清理" }).click();
  await expect(page.locator(".draft-box-row")).toHaveCount(2);
  await page
    .locator(".draft-box-row")
    .filter({ hasText: "遗留草稿" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.locator(".draft-box-preview")).toContainText(
    "原笔记删除后仍可找回",
  );
  await page.getByRole("button", { name: "另存为新笔记" }).click();
  await expect(page.getByLabel("笔记正文", { exact: true })).toHaveValue(
    "原笔记删除后仍可找回",
  );
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await (await request.get("/api/journals")).json()).toHaveLength(1);
});

test("周视图、滚动位置和资产筛选在刷新及离开返回后保留", async ({ page }) => {
  await page.goto("/calendar");
  await page.getByRole("button", { name: "下一周" }).click();
  await page.getByRole("combobox").selectOption("学习");
  const week = dateKey(addDays(startOfWeek(new Date()), 7));
  await expect(page).toHaveURL(new RegExp(`week=${week}`));
  await page.locator(".calendar-scroll").evaluate((el) => {
    el.scrollTop = 320;
  });
  await expect
    .poll(() =>
      page.evaluate(() =>
        sessionStorage.getItem("personal-os-scroll:/calendar:calendar"),
      ),
    )
    .toBe("320");
  await page.reload();
  await expect(page.getByRole("combobox")).toHaveValue("学习");
  await expect
    .poll(() => page.locator(".calendar-scroll").evaluate((el) => el.scrollTop))
    .toBe(320);
  await page.getByRole("link", { name: "资产与订阅", exact: true }).click();
  await page.getByRole("tab", { name: /我的订阅/ }).click();
  await page.getByRole("textbox", { name: /搜索/ }).fill("云空间");
  await page.getByRole("link", { name: "时间日历", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`week=${week}`));
  await expect(page.getByRole("combobox")).toHaveValue("学习");
  await page.getByRole("link", { name: "资产与订阅", exact: true }).click();
  await expect(page.getByRole("tab", { name: /我的订阅/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("textbox", { name: /搜索/ })).toHaveValue(
    "云空间",
  );
});

test("确认续费记录实际付款、推进日期，并允许更正付款", async ({
  page,
  request,
}) => {
  const sub = await createSub(request);
  await page.goto("/assets?tab=subscriptions");
  await page.getByRole("button", { name: "确认续费", exact: true }).click();
  await expect(page.getByLabel("下次续费日期", { exact: true })).toHaveValue(
    "2026-02-28",
  );
  await page.getByLabel("实际付款金额（元）", { exact: true }).fill("19.99");
  await page.getByRole("button", { name: "记录付款并更新续费" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const updated = await (
    await request.get(`/api/subscriptions/${sub.id}`)
  ).json();
  expect(updated.nextRenewal).toBe("2026-02-28");
  expect(updated.renewalAnchorDay).toBe(31);
  let payments = await (await request.get("/api/payments")).json();
  expect(payments).toHaveLength(1);
  expect(payments[0].amountCents).toBe(1999);
  await page.getByRole("button", { name: "确认续费", exact: true }).click();
  await expect(page.getByLabel("下次续费日期", { exact: true })).toHaveValue(
    "2026-03-31",
  );
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "编辑付款", exact: true }).click();
  await page.getByLabel("实际付款金额（元）", { exact: true }).fill("18.88");
  await page.getByRole("button", { name: "保存付款", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await request.delete(`/api/subscriptions/${sub.id}`, {
    headers: { "If-Match": String(updated.version) },
  });
  payments = await (await request.get("/api/payments")).json();
  expect(payments).toHaveLength(1);
  expect(payments[0].amountCents).toBe(1888);
  await page.goto("/");
  await expect(
    page.getByText("实际付款历史 · 仅显示有付款记录的月份"),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: /实际付款 18.88 元/ }),
  ).toBeVisible();
});

test("续费重试只记一笔；付款备份恢复会关联恢复后的订阅", async ({
  request,
}) => {
  const sub = await createSub(request),
    key = crypto.randomUUID();
  const body = {
    version: sub.version,
    amountCents: 1999,
    paidOn: dateKey(new Date()),
    nextRenewal: "2026-02-28",
    notes: "折扣付款",
  };
  for (let i = 0; i < 2; i++)
    expect(
      (
        await request.post(`/api/subscriptions/${sub.id}/renew`, {
          data: body,
          headers: { "Idempotency-Key": key },
        })
      ).status(),
    ).toBe(200);
  expect(
    (
      await request.post(`/api/subscriptions/${sub.id}/renew`, {
        data: body,
        headers: { "Idempotency-Key": crypto.randomUUID() },
      })
    ).status(),
  ).toBe(409);
  const data = await (await request.get("/api/data")).json();
  expect(data.payments).toHaveLength(1);
  const backup = { version: 1, exportedAt: new Date().toISOString(), ...data };
  await request.delete(`/api/subscriptions/${sub.id}`, {
    headers: { "If-Match": "1" },
  });
  await request.delete(`/api/payments/${data.payments[0].id}`, {
    headers: { "If-Match": "0" },
  });
  const response = await request.post("/api/backup", {
    data: { mode: "restore", backup },
  });
  expect(response.status()).toBe(200);
  const restored = await (await request.get("/api/data")).json();
  expect(restored.payments).toHaveLength(1);
  expect(restored.subscriptions).toHaveLength(1);
  expect(restored.payments[0].subscriptionId).toBe(
    restored.subscriptions[0].id,
  );
  expect(restored.subscriptions[0].renewalAnchorDay).toBe(31);
});
