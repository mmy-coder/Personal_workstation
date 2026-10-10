import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billingInMonth,
  conflicts,
  monthlyCost,
  overlapHours,
  timeStats,
} from "../src/lib/stats";
import { addDays, startOfWeek } from "../src/lib/dates";
import { parseMoney, schemas } from "../src/lib/validation";
import type { CalendarEvent, Subscription } from "../src/lib/types";
const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "event",
  version: 0,
  title: "专注工作",
  description: "",
  category: "工作",
  start: "2026-10-05T14:00:00+08:00",
  end: "2026-10-05T16:00:00+08:00",
  completed: false,
  createdAt: "",
  updatedAt: "",
  ...overrides,
});
const sub = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: "sub",
  version: 0,
  name: "云服务",
  category: "云服务",
  amountCents: 12000,
  cycle: "年付",
  startDate: "2026-01-01",
  nextRenewal: "2026-10-31",
  status: "使用中",
  notes: "",
  createdAt: "",
  updatedAt: "",
  ...overrides,
});
test("计划、完成工作及完成率随真实完成状态变化", () => {
  const e = event(),
    start = new Date(e.start),
    end = new Date(e.end);
  assert.equal(timeStats([e], start, end).planned, 2);
  assert.equal(timeStats([e], start, end).completed, 0);
  const done = timeStats([{ ...e, completed: true }], start, end);
  assert.equal(done.workCompleted, 2);
  assert.equal(done.rate, 100);
  assert.equal(timeStats([], start, end).rate, null);
  assert.equal(
    timeStats([event({ category: "运动", completed: true })], start, end)
      .workCompleted,
    0,
  );
});
test("跨天日程按统计区间裁剪，不重复计时", () => {
  const e = event({
    start: "2026-10-05T23:00:00+08:00",
    end: "2026-10-06T02:00:00+08:00",
  });
  assert.equal(
    overlapHours(
      e,
      new Date("2026-10-05T00:00:00+08:00"),
      new Date("2026-10-06T00:00:00+08:00"),
    ),
    1,
  );
  assert.equal(
    overlapHours(
      e,
      new Date("2026-10-06T00:00:00+08:00"),
      new Date("2026-10-07T00:00:00+08:00"),
    ),
    2,
  );
});
test("冲突检查允许相邻日程并排除自身", () => {
  const e = event();
  assert.equal(
    conflicts([e], { start: e.end, end: "2026-10-05T17:00:00+08:00" }).length,
    0,
  );
  assert.equal(conflicts([e], e).length, 0);
  assert.equal(conflicts([e], { ...e, id: "other" }).length, 1);
});
test("金额用整数分精确转换，空价格不同于零价格", () => {
  assert.equal(parseMoney("19.99"), 1999);
  assert.equal(parseMoney("0"), 0);
  assert.equal(parseMoney(""), null);
  assert.throws(() => parseMoney("-1"));
  assert.throws(() => parseMoney("1.001"));
  assert.throws(() => parseMoney("1e3"));
});
test("订阅折算仅计活跃记录，年付只计对应付款月", () => {
  assert.equal(monthlyCost(sub()), 1000);
  assert.equal(monthlyCost(sub({ status: "已暂停" })), 0);
  assert.equal(billingInMonth(sub(), new Date(2026, 9, 1)), 12000);
  assert.equal(billingInMonth(sub(), new Date(2026, 8, 1)), 0);
  assert.equal(
    billingInMonth(sub({ status: "已取消" }), new Date(2026, 9, 1)),
    0,
  );
});
test("月末续费截断到当月最后一天，并排除开始日前的付款", () => {
  assert.equal(
    billingInMonth(sub({ cycle: "月付" }), new Date(2026, 1, 1)),
    12000,
  );
  assert.equal(
    billingInMonth(
      sub({ cycle: "月付", startDate: "2026-03-01" }),
      new Date(2026, 1, 1),
    ),
    0,
  );
});
test("周一为一周开始，星期日仍属于同一周", () => {
  const monday = startOfWeek(new Date(2026, 9, 11, 16));
  assert.equal(monday.getDay(), 1);
  assert.equal(monday.getDate(), 5);
  assert.equal(addDays(monday, 7).getDate(), 12);
});
test("输入校验拒绝倒置时间、空正文、非法日期及脚本图片", () => {
  const e = event();
  assert.equal(schemas.events.safeParse(e).success, true);
  assert.equal(schemas.events.safeParse({ ...e, end: e.start }).success, false);
  assert.equal(
    schemas.events.safeParse({ ...e, start: "2026-10-05T14:00:01+08:00" })
      .success,
    false,
  );
  assert.equal(
    schemas.journals.safeParse({
      title: "",
      content: "  ",
      tags: [],
      pinned: false,
      favorite: false,
    }).success,
    false,
  );
  assert.equal(
    schemas.subscriptions.safeParse(sub({ startDate: "2026-02-30" })).success,
    false,
  );
  assert.equal(
    schemas.items.safeParse({
      name: "电脑",
      category: "数码设备",
      priceCents: null,
      purchaseDate: null,
      brand: "",
      model: "",
      status: "使用中",
      notes: "",
      imageUrl: "javascript:alert(1)",
    }).success,
    false,
  );
});
test("UTC 转换后的四分之一小时时差仍可保存", () => {
  assert.equal(
    schemas.events.safeParse(
      event({ start: "2026-10-05T08:15:00Z", end: "2026-10-05T09:15:00Z" }),
    ).success,
    true,
  );
});
