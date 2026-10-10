import { test, expect } from "@playwright/test";
import { addDays, dateKey, startOfWeek } from "../../src/lib/dates";

test("周视图快速添加、日期放大、当天列表编辑与日期定位", async ({
  page,
  request,
}) => {
  const monday = startOfWeek(new Date()),
    key = dateKey(monday);
  const title = `布局验收 ${Date.now()}：一个需要完整阅读的较长日程名称`;
  await page.goto("/calendar");
  await expect(page.locator(".day-column")).toHaveCount(7);
  await expect(page.locator(".time-rail > span")).toHaveCount(25);
  await page
    .getByRole("button", { name: `${key} 添加日程`, exact: true })
    .click();
  await expect(page.getByLabel("开始时间 *", { exact: true })).toHaveValue(
    `${key}T14:00`,
  );
  await page.getByLabel("日程名称 *", { exact: true }).fill(title);
  await page.getByRole("button", { name: "保存日程", exact: true }).click();
  if (
    await page
      .getByRole("button", { name: "仍然保存", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "仍然保存", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: `查看 ${key} 的安排`, exact: true })
    .click();
  await expect(page.locator(".day-column")).toHaveCount(1);
  await expect(page.locator(".calendar-agenda")).toContainText(title);
  await page
    .locator(".calendar-agenda-event")
    .filter({ hasText: title })
    .click();
  await expect(page.getByLabel("日程名称 *", { exact: true })).toHaveValue(
    title,
  );
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  await page.getByRole("button", { name: "下午", exact: true }).click();
  await expect
    .poll(() => page.locator(".calendar-scroll").evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await page.screenshot({
    path: "test-results/calendar-day-layout.png",
    fullPage: true,
    animations: "disabled",
  });
  const target = dateKey(addDays(monday, 10));
  await page.getByLabel("定位日期", { exact: true }).fill(target);
  await expect(
    page.getByRole("button", { name: `${target} 添加日程`, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新建日程", exact: true }).click();
  await expect(page.getByLabel("开始时间 *", { exact: true })).toHaveValue(
    `${target}T14:00`,
  );
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();
  await page.reload();
  await expect(page.locator(".day-column")).toHaveCount(1);
  await expect(page.getByLabel("定位日期", { exact: true })).toHaveValue(
    target,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".calendar-scroll")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/calendar-day-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  const rows = await (await request.get("/api/events")).json();
  for (const row of rows.filter((r: { title: string }) => r.title === title))
    await request.delete(`/api/events/${row.id}`, {
      headers: { "If-Match": String(row.version) },
    });
});
