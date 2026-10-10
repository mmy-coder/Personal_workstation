import { test, expect, type APIRequestContext } from "@playwright/test";
import { addDays, dateKey, startOfWeek } from "../../src/lib/dates";
import { workspaceURL } from "../../src/lib/workspace-url";

async function note(
  request: APIRequestContext,
  content = "原始内容",
  title = "版本测试",
) {
  const result = await request.post("/api/journals", {
    data: { title, content, tags: ["成长"], pinned: false, favorite: false },
  });
  expect(result.status()).toBe(201);
  return result.json();
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
      expect(
        (
          await request.delete(`/api/${kind}/${row.id}`, {
            headers: { "If-Match": String(row.version) },
          })
        ).status(),
      ).toBe(200);
});

test("保存期间锁定输入，失败后正文和草稿仍保留", async ({ page }) => {
  await page.goto("/journal");
  await page
    .getByRole("button", { name: "记录一个想法", exact: true })
    .first()
    .click();
  await page.getByLabel("笔记正文", { exact: true }).fill("必须保留的文字");
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  await page.route("**/api/journals", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await waiting;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "测试保存失败" }),
    });
  });
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(page.getByLabel("笔记正文", { exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  finish();
  await expect(page.getByRole("alert")).toContainText("测试保存失败");
  await expect(page.getByLabel("笔记正文", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("笔记正文", { exact: true })).toHaveValue(
    "必须保留的文字",
  );
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  await page
    .getByRole("button", { name: "记录一个想法", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("笔记正文", { exact: true })).toHaveValue(
    "必须保留的文字",
  );
});

test("后台同步失败不卸载表单，恢复同步后输入仍在", async ({ page }) => {
  await page.goto("/assets");
  await page
    .getByRole("button", { name: "添加物品", exact: true })
    .first()
    .click();
  await page.getByLabel("物品名称 *", { exact: true }).fill("尚未提交的电脑");
  await page.route("**/api/data?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "暂时不可用" }),
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".sync-warning")).toContainText(
    "当前内容和输入已保留",
  );
  await expect(page.getByLabel("物品名称 *", { exact: true })).toHaveValue(
    "尚未提交的电脑",
  );
  await page.unroute("**/api/data?**");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".sync-warning")).toHaveCount(0);
  await expect(page.getByLabel("物品名称 *", { exact: true })).toHaveValue(
    "尚未提交的电脑",
  );
});

test("正文改回原文后不再恢复中间草稿", async ({ page, request }) => {
  const row = await note(request);
  await page.goto("/journal");
  await page.locator(".note-body").click();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("笔记正文", { exact: true }).fill("中间草稿");
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          Object.keys(localStorage)
            .filter((key) =>
              key.startsWith(`personal-os-draft-v2:${encodeURIComponent(id)}:`),
            )
            .map((key) => localStorage.getItem(key))
            .join("") || null,
        row.id,
      ),
    )
    .toContain("中间草稿");
  await page.getByLabel("笔记正文", { exact: true }).fill("原始内容");
  await expect
    .poll(() =>
      page.evaluate(
        (id) =>
          Object.keys(localStorage)
            .filter((key) =>
              key.startsWith(`personal-os-draft-v2:${encodeURIComponent(id)}:`),
            )
            .map((key) => localStorage.getItem(key))
            .join("") || null,
        row.id,
      ),
    )
    .toBeNull();
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  await page.locator(".note-body").click();
  await expect(page.locator(".journal-preview")).toContainText("原始内容");
  await expect(page.locator(".journal-preview")).not.toContainText("中间草稿");
});

test("同版本并发写入仅一项成功，旧版本不能更新或删除", async ({ request }) => {
  const row = await note(request),
    url = `/api/journals/${row.id}`;
  expect(
    (await request.patch(url, { data: { favorite: true } })).status(),
  ).toBe(428);
  const responses = await Promise.all([
    request.patch(url, {
      data: { content: "窗口一内容" },
      headers: { "If-Match": "0" },
    }),
    request.patch(url, {
      data: { favorite: true },
      headers: { "If-Match": "0" },
    }),
  ]);
  expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
  expect(
    (await request.delete(url, { headers: { "If-Match": "0" } })).status(),
  ).toBe(409);
  const current = await (await request.get(url)).json();
  const updated = await request.patch(url, {
    data: { pinned: true },
    headers: { "If-Match": String(current.version) },
  });
  expect(updated.status()).toBe(200);
  const result = await updated.json();
  expect(result.content).toBe(current.content);
  expect(result.favorite).toBe(current.favorite);
  expect(result.pinned).toBe(true);
  expect(result.version).toBe(2);
});

test("旧窗口保存冲突后保留输入，可阅读新版并另存", async ({
  page,
  request,
}) => {
  const row = await note(request),
    url = `/api/journals/${row.id}`;
  await page.goto("/journal");
  await page.locator(".note-body").click();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByLabel("笔记正文", { exact: true }).fill("窗口中的未提交文字");
  await request.patch(url, {
    data: { content: "其他窗口已保存的新内容" },
    headers: { "If-Match": "0" },
  });
  await page.getByRole("button", { name: "保存笔记", exact: true }).click();
  await expect(page.locator(".form-error")).toContainText("其他窗口修改");
  await expect(page.getByLabel("笔记正文", { exact: true })).toHaveValue(
    "窗口中的未提交文字",
  );
  await page.getByRole("button", { name: "查看最新内容" }).click();
  await expect(page.locator(".latest-note")).toContainText(
    "其他窗口已保存的新内容",
  );
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  await page.locator(".note-body").click();
  await expect(page.locator(".warning")).toContainText("原笔记已更新");
  await expect(page.getByLabel("笔记正文", { exact: true })).toHaveValue(
    "窗口中的未提交文字",
  );
  await page.getByRole("button", { name: "另存为新笔记" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const rows = await (await request.get("/api/journals")).json();
  expect(rows).toHaveLength(2);
  expect(rows.find((r: { id: string }) => r.id === row.id).content).toBe(
    "其他窗口已保存的新内容",
  );
  expect(
    rows.some((r: { content: string }) => r.content === "窗口中的未提交文字"),
  ).toBe(true);
});

test("其他周新增默认在可见周，刷新及切周后仍保留", async ({ page }) => {
  await page.goto("/calendar");
  await page.getByRole("button", { name: "下一周" }).click();
  await page.getByRole("button", { name: "新建日程", exact: true }).click();
  const monday = addDays(startOfWeek(new Date()), 7);
  await expect(page.getByLabel("开始时间 *", { exact: true })).toHaveValue(
    `${dateKey(monday)}T14:00`,
  );
  await page.getByLabel("日程名称 *", { exact: true }).fill("下周可见的计划");
  await page.getByRole("button", { name: "保存日程", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "编辑日程 下周可见的计划" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "编辑日程 下周可见的计划" }),
  ).toBeVisible();
});

test("笔记分页搜索完整正文，总览摘要不泄漏全文，导出保留全文", async ({
  page,
  request,
}) => {
  const content = "长文".repeat(500) + "独特结尾关键词";
  for (let i = 0; i < 13; i++)
    await note(request, i === 0 ? content : `第 ${i} 条内容`, `分页笔记 ${i}`);
  const summary = await (await request.get(workspaceURL())).json();
  expect(summary.journalStats.total).toBe(13);
  expect(summary.journalStats.monthCount).toBe(13);
  expect(summary.journals).toHaveLength(3);
  expect(summary.journals.every((j: object) => !("content" in j))).toBe(true);
  await page.goto("/journal");
  await expect(page.locator(".note-card")).toHaveCount(12);
  await page.getByRole("button", { name: "下一页", exact: true }).click();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await page.getByLabel("搜索笔记").fill("独特结尾关键词");
  await expect(page.locator(".pagination")).toHaveCount(0);
  await expect(page.locator(".note-card")).toHaveCount(1);
  await page.locator(".note-body").click();
  await expect(page.locator(".journal-preview")).toContainText(
    "独特结尾关键词",
  );
  const full = await (await request.get("/api/data")).json();
  expect(full.journals).toHaveLength(13);
  expect(
    full.journals.some((j: { content: string }) => j.content === content),
  ).toBe(true);
  expect((await request.get("/api/events?from=bad&to=bad")).status()).toBe(400);
});
