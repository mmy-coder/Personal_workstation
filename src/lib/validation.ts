import { z } from "zod";
const short = z
  .string()
  .trim()
  .min(1, "请填写此项")
  .max(120, "最多 120 个字符");
const notes = z.string().max(20000, "内容过长");
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "请选择日期")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !isNaN(+d) && d.toISOString().slice(0, 10) === s;
  }, "日期无效");
const cents = z
  .number()
  .int("金额最多保留两位小数")
  .min(0, "金额不能为负数")
  .max(2000000000, "金额超出范围");
// Browser inputs enforce local half-hour steps. UTC offsets can include 15/45
// minutes, so do not mistakenly enforce the browser's grid against UTC minutes.
const timestamp = z
  .string()
  .datetime({ offset: true })
  .refine((s) => {
    const d = new Date(s);
    return d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
  }, "时间精度应为分钟");
export const schemas = {
  events: z
    .object({
      title: short,
      description: notes,
      category: short.max(30),
      start: timestamp,
      end: timestamp,
      completed: z.boolean(),
    })
    .refine((v) => +new Date(v.end) > +new Date(v.start), {
      message: "结束时间必须晚于开始时间",
      path: ["end"],
    })
    .refine((v) => +new Date(v.end) - +new Date(v.start) <= 31 * 86400000, {
      message: "单条日程最长 31 天",
      path: ["end"],
    }),
  items: z.object({
    name: short,
    category: short,
    priceCents: cents.nullable(),
    purchaseDate: day.nullable(),
    brand: z.string().max(120),
    model: z.string().max(120),
    status: z.enum(["使用中", "闲置", "已出售", "已丢弃"]),
    notes,
    imageUrl: z.union([
      z.literal(""),
      z
        .string()
        .url("请输入完整图片网址")
        .max(2000)
        .refine((s) => /^https?:\/\//.test(s), "仅支持 http 或 https 图片网址"),
    ]),
  }),
  subscriptions: z
    .object({
      name: short,
      category: short,
      amountCents: cents,
      cycle: z.enum(["月付", "年付"]),
      startDate: day,
      nextRenewal: day,
      renewalAnchorDay: z.number().int().min(1).max(31).nullable().optional(),
      status: z.enum(["使用中", "已暂停", "已取消"]),
      notes,
    })
    .refine((v) => v.nextRenewal >= v.startDate, {
      message: "续费日期不能早于开始日期",
      path: ["nextRenewal"],
    }),
  payments: z.object({
    subscriptionId: z.string().min(1).max(200),
    name: short,
    category: short,
    amountCents: cents,
    paidOn: day,
    dueOn: day,
    notes,
  }),
  journals: z.object({
    title: z.string().trim().max(120),
    content: z
      .string()
      .trim()
      .min(1, "写下一点内容再保存吧")
      .max(100000, "正文最多 10 万个字符"),
    tags: z
      .array(z.string().trim().min(1).max(30))
      .max(20, "最多添加 20 个标签")
      .transform((v) => [...new Set(v)]),
    pinned: z.boolean(),
    favorite: z.boolean(),
  }),
};
export function parseMoney(value: string): number | null {
  if (value.trim() === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error("金额必须为非负数，最多两位小数");
  const [a, b = ""] = value.trim().split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  if (n > 2000000000) throw new Error("金额超出范围");
  return n;
}
