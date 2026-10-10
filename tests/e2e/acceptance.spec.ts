import { test, expect } from "@playwright/test";
import { dateKey, inputDateTime, startOfWeek } from "../../src/lib/dates";
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
test("完整验收：日历、物品、订阅、笔记持久化并联动总览", async ({
  page,
  request,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /让今天更有序/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "时间日历", exact: true }).click();
  await expect(page.locator(".time-slot")).toHaveCount(336);
  await page.getByRole("button", { name: "新建日程", exact: true }).click();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(14, 0, 0, 0);
  const end = new Date(tomorrow);
  end.setHours(16);
  await page.getByLabel("日程名称 *", { exact: true }).fill("明天下午专注工作");
  await page
    .getByLabel("开始时间 *", { exact: true })
    .fill(inputDateTime(tomorrow));
  await page.getByLabel("结束时间 *", { exact: true }).fill(inputDateTime(end));
  await page.getByRole("button", { name: "保存日程", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  if (+startOfWeek(tomorrow) !== +startOfWeek(new Date()))
    await page.getByRole("button", { name: "下一周" }).click();
  await expect(
    page.getByRole("button", { name: "编辑日程 明天下午专注工作" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "编辑日程 明天下午专注工作" }).click();
  await page.getByRole("checkbox", { name: /标记为已完成/ }).check();
  await page.getByRole("button", { name: "保存日程", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "总览", exact: true }).click();
  if (+startOfWeek(tomorrow) === +startOfWeek(new Date())) {
    await expect(
      page
        .locator(".metric")
        .filter({ hasText: "本周已完成工作" })
        .locator(".metric-value"),
    ).toContainText("2");
    await expect(
      page
        .locator(".metric")
        .filter({ hasText: "本周计划完成率" })
        .locator(".metric-value"),
    ).toContainText("100");
  }
  await page.getByRole("link", { name: "资产与订阅", exact: true }).click();
  await page
    .getByRole("button", { name: "添加物品", exact: true })
    .first()
    .click();
  await page.getByLabel("物品名称 *", { exact: true }).fill("我的工作电脑");
  await page.getByLabel("购买价格（元）", { exact: true }).fill("12999.99");
  await page.getByLabel("品牌", { exact: true }).fill("Apple");
  await page.getByRole("button", { name: "保存物品" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".metric").filter({ hasText: "累计购买金额" }),
  ).toContainText("12,999.99");
  await expect(
    page.locator(".metric").filter({ hasText: "物品总数" }),
  ).toContainText("1");
  await page.getByRole("tab", { name: /我的订阅/ }).click();
  await page
    .getByRole("button", { name: "添加订阅", exact: true })
    .first()
    .click();
  await page.getByLabel("订阅名称 *", { exact: true }).fill("每月云空间");
  await page.getByLabel("每期付款金额（元）*", { exact: true }).fill("30");
  await page.getByRole("button", { name: "保存订阅" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".metric").filter({ hasText: "月均订阅成本" }),
  ).toContainText("30.00");
  await expect(
    page.locator(".metric").filter({ hasText: "年化订阅成本" }),
  ).toContainText("360.00");
  await page.getByRole("link", { name: "感悟笔记", exact: true }).click();
  await page
    .getByRole("button", { name: "记录一个想法", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "笔记正文", exact: true })
    .fill("## 留下今天\n\n专注比忙碌重要。\n\n- 给自己一点时间");
  await page
    .getByRole("textbox", { name: "笔记标题", exact: true })
    .fill("今天的领悟");
  await page
    .getByRole("textbox", { name: "笔记标签", exact: true })
    .fill("成长，工作");
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  await page
    .getByRole("button", { name: "记录一个想法", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "笔记正文", exact: true }),
  ).toHaveValue(/专注比忙碌重要/);
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.getByRole("heading", { name: "留下今天" })).toBeVisible();
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await page.getByRole("textbox", { name: "搜索笔记" }).fill("专注");
  await expect(page.locator(".note-card")).toHaveCount(1);
  await page.locator(".note-body").click();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page
    .getByRole("textbox", { name: "笔记正文", exact: true })
    .fill("专注比忙碌重要。已经修改。");
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "总览", exact: true }).click();
  await expect(
    page.locator(".metric").filter({ hasText: "本月订阅支出" }),
  ).toContainText("30.00");
  await expect(
    page.locator(".metric").filter({ hasText: "本月新增笔记" }),
  ).toContainText("1");
  await expect(page.getByText("专注比忙碌重要。已经修改。")).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "切换深色主题" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.screenshot({
    path: "test-results/dashboard-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "打开导航" }).click();
  await page.getByRole("link", { name: "感悟笔记", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "感悟笔记", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/journal-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  const persisted = await (await request.get("/api/data")).json();
  expect(persisted.events[0].completed).toBe(true);
  expect(persisted.items[0].priceCents).toBe(1299999);
  expect(persisted.journals[0].content).toContain("已经修改");
  expect(failures).toEqual([]);
});
test("API 校验、精度、更新、删除与跨站写入保护", async ({ request }) => {
  const body = {
    name: "测试订阅",
    category: "云服务",
    amountCents: 12000,
    cycle: "年付",
    startDate: dateKey(new Date()),
    nextRenewal: dateKey(new Date()),
    status: "使用中",
    notes: "",
  };
  expect(
    (
      await request.post("/api/subscriptions", {
        data: { ...body, amountCents: -1 },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/subscriptions", {
        data: body,
        headers: { origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
  const response = await request.post("/api/subscriptions", { data: body });
  expect(response.status()).toBe(201);
  const record = await response.json();
  expect(
    (
      await request.patch(`/api/subscriptions/${record.id}`, {
        data: { ...body, status: "已取消" },
        headers: { "If-Match": String(record.version) },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.delete(`/api/subscriptions/${record.id}`, {
        headers: { "If-Match": String(record.version + 1) },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.delete(`/api/subscriptions/${record.id}`, {
        headers: { "If-Match": String(record.version + 1) },
      })
    ).status(),
  ).toBe(404);
  const journal = await request.post("/api/journals", {
    data: {
      title: "",
      content: "一条无标题笔记",
      tags: ["成长", "成长"],
      pinned: false,
      favorite: true,
    },
  });
  expect(journal.status()).toBe(201);
  const j = await journal.json();
  expect(j.tags).toEqual(["成长"]);
  expect(
    (
      await request.delete(`/api/journals/${j.id}`, {
        headers: { "If-Match": String(j.version) },
      })
    ).status(),
  ).toBe(200);
});
test("日历空格建档、拖拽、时长调整、冲突确认与删除", async ({
  page,
  request,
}) => {
  await page.goto("/calendar");
  const monday = startOfWeek(new Date()),
    key = dateKey(monday);
  await page
    .getByRole("button", { name: `${key} 09:00 新建日程`, exact: true })
    .click();
  await page.getByLabel("日程名称 *", { exact: true }).fill("拖拽测试");
  await page.getByRole("button", { name: "保存日程", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const event = page.getByRole("button", {
    name: "编辑日程 拖拽测试",
    exact: true,
  });
  await event.dragTo(
    page.getByRole("button", { name: `${key} 11:00 新建日程`, exact: true }),
  );
  await expect
    .poll(async () => {
      const rows = await (await request.get("/api/events")).json();
      return new Date(rows[0].start).getHours();
    })
    .toBe(11);
  const handle = event.locator(".resize-handle");
  await event.hover();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  const hourHeight =
    (await page.locator(".time-slot").first().boundingBox())!.height * 2;
  await page.mouse.move(
    box!.x + box!.width / 2,
    box!.y + box!.height / 2 + hourHeight,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => {
      const rows = await (await request.get("/api/events")).json();
      return (+new Date(rows[0].end) - +new Date(rows[0].start)) / 3600000;
    })
    .toBe(2);
  await page.getByRole("button", { name: "新建日程", exact: true }).click();
  await page.getByLabel("日程名称 *", { exact: true }).fill("允许冲突的安排");
  await page.getByLabel("开始时间 *", { exact: true }).fill(`${key}T11:30`);
  await page.getByLabel("结束时间 *", { exact: true }).fill(`${key}T12:30`);
  await page.getByRole("button", { name: "保存日程", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("时间冲突");
  await page.getByRole("button", { name: "仍然保存", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".calendar-event")).toHaveCount(2);
  await page.screenshot({
    path: "test-results/calendar-desktop.png",
    fullPage: true,
  });
  await event.click();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await expect(page.getByRole("button", { name: "确认删除" })).toBeVisible();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".calendar-event")).toHaveCount(1);
});
test("物品修改删除、订阅暂停不计成本、笔记收藏与删除", async ({
  page,
  request,
}) => {
  const item = await (
    await request.post("/api/items", {
      data: {
        name: "备用电脑",
        category: "数码设备",
        priceCents: 10000,
        purchaseDate: null,
        brand: "",
        model: "",
        status: "使用中",
        notes: "",
        imageUrl: "",
      },
    })
  ).json();
  await request.post("/api/subscriptions", {
    data: {
      name: "暂停测试",
      category: "效率工具",
      amountCents: 9900,
      cycle: "月付",
      startDate: dateKey(new Date()),
      nextRenewal: dateKey(new Date()),
      status: "使用中",
      notes: "",
    },
  });
  await page.goto("/assets");
  await page.getByRole("button", { name: "编辑备用电脑" }).click();
  await page
    .getByRole("combobox", { name: "状态", exact: true })
    .selectOption("闲置");
  await page.getByLabel("购买价格（元）", { exact: true }).fill("0");
  await page.getByRole("button", { name: "保存物品" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".metric").filter({ hasText: "累计购买金额" }),
  ).toContainText("0.00");
  await expect(
    page.locator(".metric").filter({ hasText: "闲置物品" }),
  ).toContainText("1");
  await page.getByRole("button", { name: "编辑备用电脑" }).click();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await (await request.get("/api/items")).json()).find(
      (i: { id: string }) => i.id === item.id,
    ),
  ).toBeUndefined();
  await page.getByRole("tab", { name: /我的订阅/ }).click();
  await page.getByRole("button", { name: "编辑暂停测试" }).click();
  await page
    .getByRole("combobox", { name: "状态", exact: true })
    .selectOption("已暂停");
  await page.getByRole("button", { name: "保存订阅" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".metric").filter({ hasText: "月均订阅成本" }),
  ).toContainText("0.00");
  await request.post("/api/journals", {
    data: {
      title: "测试收藏",
      content: "留下文字",
      tags: ["测试"],
      pinned: false,
      favorite: false,
    },
  });
  await page.goto("/journal");
  await page.getByRole("button", { name: "收藏测试收藏", exact: true }).click();
  await page.getByRole("button", { name: "仅收藏", exact: true }).click();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await page.locator(".note-body").click();
  await page.getByRole("button", { name: "删除笔记", exact: true }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".note-card")).toHaveCount(0);
});
