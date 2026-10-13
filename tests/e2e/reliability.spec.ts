import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { test, expect, type APIRequestContext } from "@playwright/test";
async function createNote(request: APIRequestContext, content = "原文") {
  return (
    await request.post("/api/journals", {
      data: {
        title: "恢复测试",
        content,
        tags: [],
        pinned: false,
        favorite: false,
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
test("两个窗口的新笔记草稿互不覆盖，保存一份不会清除另一份", async ({
  page,
}) => {
  await page.goto("/journal");
  await page
    .getByRole("button", { name: "记录一个想法", exact: true })
    .first()
    .click();
  await page.getByLabel("笔记正文", { exact: true }).fill("窗口甲的独立草稿");
  const second = await page.context().newPage();
  await second.goto("/journal");
  await second
    .getByRole("button", { name: "记录一个想法", exact: true })
    .first()
    .click();
  await expect(second.getByLabel("笔记正文", { exact: true })).toHaveValue("");
  await second.getByLabel("笔记正文", { exact: true }).fill("窗口乙的独立草稿");
  await second.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(second.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  await page
    .getByRole("button", { name: "记录一个想法", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("笔记正文", { exact: true })).toHaveValue(
    "窗口甲的独立草稿",
  );
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  await page.reload();
  await page
    .getByRole("button", { name: "记录一个想法", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("笔记正文", { exact: true })).toHaveValue(
    "窗口甲的独立草稿",
  );
  await second.close();
});
test("物品与日程表单关闭前保护未保存输入", async ({ page }) => {
  for (const config of [
    { path: "/assets", button: "添加物品", label: "物品名称 *" },
    { path: "/calendar", button: "新建日程", label: "日程名称 *" },
  ]) {
    await page.goto(config.path);
    await page
      .getByRole("button", { name: config.button, exact: true })
      .first()
      .click();
    await page.getByLabel(config.label, { exact: true }).fill("不能意外丢失");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alert")).toContainText("尚未保存");
    await page.getByRole("button", { name: "继续编辑" }).click();
    await expect(page.getByLabel(config.label, { exact: true })).toHaveValue(
      "不能意外丢失",
    );
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await page.getByRole("button", { name: "放弃修改" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
});
test("笔记被其他窗口删除后仍能另存未提交内容", async ({ page, request }) => {
  const row = await createNote(request);
  await page.goto("/journal");
  await page.locator(".note-body").click();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("笔记正文", { exact: true }).fill("原记录删除后仍保留");
  await request.delete(`/api/journals/${row.id}`, {
    headers: { "If-Match": "0" },
  });
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(page.locator(".form-error")).toContainText("不存在");
  await page.getByRole("button", { name: "另存为新笔记" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const rows = await (await request.get("/api/journals")).json();
  expect(rows).toHaveLength(1);
  expect(rows[0].content).toBe("原记录删除后仍保留");
});
test("恢复预览不写入，执行只补缺失项且重复恢复不重复创建", async ({
  page,
  request,
}) => {
  const deleted = await createNote(request, "要补回的正文"),
    existing = await createNote(request, "已有正文");
  const data = await (await request.get("/api/data")).json();
  const backup = { version: 1, exportedAt: new Date().toISOString(), ...data };
  await request.delete(`/api/journals/${deleted.id}`, {
    headers: { "If-Match": "0" },
  });
  await request.patch(`/api/journals/${existing.id}`, {
    data: { content: "最新修改，不能覆盖" },
    headers: { "If-Match": "0" },
  });
  await page.goto("/journal");
  await page.getByRole("button", { name: "设置与数据", exact: true }).click();
  await page.getByLabel("选择备份文件").setInputFiles({
    name: "test-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.getByRole("heading", { name: "恢复预览" })).toBeVisible();
  expect(await (await request.get("/api/journals")).json()).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "确认恢复 1 条记录" }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "我已核对预览，确认补回缺失记录" })
    .check();
  await page.getByRole("button", { name: "确认恢复 1 条记录" }).click();
  await expect(page.getByRole("heading", { name: "恢复完成" })).toBeVisible();
  await expect(page.locator(".backup-path")).toContainText("e2e.db");
  const rows = await (await request.get("/api/journals")).json();
  expect(rows).toHaveLength(2);
  expect(rows.find((r: { id: string }) => r.id === existing.id).content).toBe(
    "最新修改，不能覆盖",
  );
  expect(
    rows.find((r: { content: string }) => r.content === "要补回的正文").id,
  ).not.toBe(deleted.id);
  const again = await request.post("/api/backup", {
    data: { mode: "restore", backup },
  });
  expect(again.status()).toBe(200);
  expect((await again.json()).counts.journals).toEqual({
    total: 2,
    add: 0,
    skip: 2,
  });
  const invalid = await request.post("/api/backup", {
    data: {
      mode: "restore",
      backup: { ...backup, journals: [{ ...backup.journals[0], content: "" }] },
    },
  });
  expect(invalid.status()).toBe(400);
  expect(await (await request.get("/api/journals")).json()).toHaveLength(2);
});
test("跨日自动重算总览，已开始的任务从即将开始列表移除", async ({
  page,
  request,
}) => {
  await page.clock.install({ time: new Date("2026-10-11T23:59:40+08:00") });
  await request.post("/api/events", {
    data: {
      title: "跨日待开始任务",
      description: "",
      category: "工作",
      start: "2026-10-12T00:00:00+08:00",
      end: "2026-10-12T01:00:00+08:00",
      completed: false,
    },
  });
  await page.goto("/");
  await expect(
    page.locator(".metric").filter({ hasText: "本周计划时长" }),
  ).toContainText("0");
  const upcoming = page.locator(".panel").filter({
    has: page.getByRole("heading", { name: "即将开始", exact: true }),
  });
  await expect(upcoming).toContainText("跨日待开始任务");
  await page.clock.runFor(35000);
  await expect(upcoming).not.toContainText("跨日待开始任务");
  await expect(
    page
      .locator(".metric")
      .filter({ hasText: "本周计划时长" })
      .locator(".metric-value"),
  ).toContainText("1");
  await expect(page.locator(".current-date")).toContainText("10月12日");
});

test("四类备份完整恢复，恢复前副本可读，事务中途失败全部回滚", async ({
  request,
}) => {
  const now = "2026-10-10T00:00:00.000Z";
  const meta = { version: 0, createdAt: now, updatedAt: now };
  const backup = {
    version: 1,
    exportedAt: now,
    events: [
      {
        ...meta,
        id: "restore-event",
        title: "恢复日程",
        description: "",
        category: "工作",
        start: "2026-10-10T06:00:00.000Z",
        end: "2026-10-10T08:00:00.000Z",
        completed: true,
      },
    ],
    items: [
      {
        ...meta,
        id: "restore-item",
        name: "恢复电脑",
        category: "数码设备",
        priceCents: 199999,
        purchaseDate: null,
        brand: "",
        model: "",
        status: "使用中",
        notes: "",
        imageUrl: "",
      },
    ],
    subscriptions: [
      {
        ...meta,
        id: "restore-sub",
        name: "恢复订阅",
        category: "云服务",
        amountCents: 1999,
        cycle: "月付",
        startDate: "2026-01-01",
        nextRenewal: "2026-10-15",
        status: "使用中",
        notes: "",
      },
    ],
    journals: [
      {
        ...meta,
        id: "restore-journal",
        title: "",
        content: "恢复长文",
        tags: ["成长", "反思"],
        pinned: true,
        favorite: true,
      },
    ],
  };
  const testDB = new DatabaseSync("prisma/e2e.db");
  try {
    testDB.exec(
      "CREATE TRIGGER test_restore_abort BEFORE INSERT ON \"BackupRestoreLink\" BEGIN SELECT RAISE(ABORT, 'test restore failure'); END",
    );
    const failed = await request.post("/api/backup", {
      data: { mode: "restore", backup },
    });
    expect(failed.status()).toBe(500);
    const after = await (await request.get("/api/data")).json();
    for (const kind of [
      "events",
      "items",
      "subscriptions",
      "journals",
      "payments",
    ])
      expect(after[kind]).toHaveLength(0);
  } finally {
    testDB.exec("DROP TRIGGER IF EXISTS test_restore_abort");
    testDB.close();
  }
  const restored = await request.post("/api/backup", {
    data: { mode: "restore", backup },
  });
  expect(restored.status()).toBe(200);
  const result = await restored.json();
  expect(result.safetyCopy.replaceAll("\\", "/")).toMatch(
    /^prisma\/backups\/e2e\.db\//,
  );
  const safety = JSON.parse(await readFile(result.safetyCopy, "utf8"));
  const after = await (await request.get("/api/data")).json();
  for (const kind of [
    "events",
    "items",
    "subscriptions",
    "journals",
    "payments",
  ]) {
    expect(after[kind]).toHaveLength(kind === "payments" ? 0 : 1);
    expect(safety[kind]).toHaveLength(0);
  }
  expect(after.events[0].completed).toBe(true);
  expect(after.items[0].priceCents).toBe(199999);
  expect(after.subscriptions[0].amountCents).toBe(1999);
  expect(after.journals[0].tags).toEqual(["成长", "反思"]);
  expect(after.journals[0].createdAt).toBe(now);
  expect(
    (
      await request.post("/api/backup", {
        data: { mode: "restore", backup },
        headers: { origin: "https://example.invalid" },
      })
    ).status(),
  ).toBe(403);
});

test("保存笔记后只重新查询一次列表", async ({ page }) => {
  await page.goto("/journal");
  await expect(page.getByText("第一条记录，从此刻开始")).toBeVisible();
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/journals?page=")) requests++;
  });
  await page
    .getByRole("button", { name: "记录一个想法", exact: true })
    .first()
    .click();
  await page.getByLabel("笔记正文", { exact: true }).fill("单次列表更新");
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(page.locator(".note-card")).toHaveCount(1);
  expect(requests).toBe(1);
});
