import { PrismaClient } from "@prisma/client";

// Opt-in only. Stable IDs make re-running safe: existing records are never changed.
const db = new PrismaClient();
const now = new Date();
const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
const day = (offset, hour = 0, minute = 0) => {
  const result = new Date(today);
  result.setDate(result.getDate() + offset);
  result.setHours(hour, minute, 0, 0);
  return result;
};
const dateKey = (value) =>
  `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const mondayOffset = -((today.getDay() + 6) % 7);
const prefix = "personal-os-demo-v1";
const demoNote = "【示例数据】用于检查界面、筛选与统计，可自由编辑或删除。";
const events = [];
function event(
  id,
  title,
  category,
  offset,
  hour,
  minute,
  duration,
  complete = true,
) {
  const start = day(offset, hour, minute);
  const end = new Date(+start + duration * 3600000);
  events.push({
    id: `${prefix}-event-${id}`,
    title: `示例 · ${title}`,
    category,
    start,
    end,
    completed: complete && end < now,
    description: `${demoNote}\n${category === "工作" ? "关闭消息通知，专注完成当前任务。" : "为生活里的重要部分留出时间。"}`,
  });
}

const morning = [
  "梳理本周优先级",
  "个人项目开发",
  "设计方案与原型",
  "核心功能开发",
  "整理交付与复盘",
  "学习 TypeScript",
  "阅读与知识整理",
];
const afternoon = [
  "推进产品方案",
  "实现日历交互",
  "整理需求与文档",
  "检查数据与测试",
  "下周项目规划",
  "城市散步与拍照",
  "一周生活整理",
];
for (let i = 0; i < 7; i++) {
  const offset = mondayOffset + i;
  event(
    `week-${i}-morning`,
    morning[i],
    i < 5 ? "工作" : "学习",
    offset,
    9,
    0,
    i === 2 ? 2 : 2.5,
  );
  event(
    `week-${i}-afternoon`,
    afternoon[i],
    i < 5 ? "工作" : "生活",
    offset,
    14,
    0,
    i === 4 ? 1.5 : 2,
    i !== 2,
  );
  event(
    `week-${i}-evening`,
    i % 2 ? "拉伸与力量训练" : "傍晚慢跑",
    "运动",
    offset,
    18,
    30,
    1,
  );
  event(
    `week-${i}-night`,
    i % 2 ? "读书与摘录" : "听音乐，放空一会儿",
    i % 2 ? "学习" : "休息",
    offset,
    21,
    0,
    1,
  );
}
for (let i = 0; i < 7; i++) {
  event(
    `last-week-${i}`,
    [
      "代码整理",
      "资料研究",
      "方案评审",
      "专注写作",
      "项目总结",
      "摄影练习",
      "整理书架",
    ][i],
    i < 5 ? "工作" : "生活",
    mondayOffset - 7 + i,
    10,
    0,
    [2, 3, 1.5, 2.5, 2, 1, 1.5][i],
  );
}
event("next-week-work", "新一周专注工作", "工作", mondayOffset + 7, 9, 0, 2);
event(
  "next-week-learning",
  "课程学习与实践",
  "学习",
  mondayOffset + 8,
  14,
  0,
  1.5,
);
event(
  "next-week-custom",
  "个人作品集整理",
  "自定义",
  mondayOffset + 9,
  15,
  0,
  2,
);
event(
  "cross-midnight",
  "夜间灵感整理（跨天）",
  "自定义",
  mondayOffset + 5,
  23,
  30,
  1,
);

const itemRows = [
  [
    "MacBook Pro 14",
    "数码设备",
    1499900,
    "Apple",
    "M3 Pro / 18GB",
    "使用中",
    -280,
  ],
  ["iPhone 15", "数码设备", 599900, "Apple", "256GB", "使用中", -320],
  ["降噪耳机", "数码设备", 199900, "Sony", "WH-1000XM5", "使用中", -180],
  ["电子阅读器", "数码设备", 129900, "Kindle", "Paperwhite", "闲置", -500],
  ["机械键盘", "数码设备", 69900, "Keychron", "K3", "使用中", -85],
  ["旧显示器", "数码设备", 159900, "Dell", "U2419H", "已出售", -900],
  ["微单相机", "摄影器材", 799900, "Fujifilm", "X-S20", "使用中", -130],
  ["定焦镜头", "摄影器材", 259900, "Sigma", "30mm F1.4", "使用中", -100],
  ["轻便三脚架", "摄影器材", 39900, "思锐", "旅行款", "闲置", -230],
  ["人体工学椅", "家具", 189900, "西昊", "Doro C300", "使用中", -160],
  ["书桌台灯", "家具", 39900, "明基", "阅读灯", "使用中", -70],
  ["《深度工作》", "书籍", 5900, "", "纸质版", "使用中", -25],
  ["《原子习惯》", "书籍", 4900, "", "纸质版", "使用中", -12],
  ["手写笔记本", "生活用品", null, "", "朋友赠送", "使用中", null],
  ["旧旅行水杯", "生活用品", 12900, "膳魔师", "500ml", "已丢弃", -700],
  ["瑜伽垫", "其他", 19900, "迪卡侬", "8mm", "使用中", -45],
];
const items = itemRows.map(
  ([name, category, priceCents, brand, model, status, offset], i) => ({
    id: `${prefix}-item-${i}`,
    name: `示例 · ${name}`,
    category,
    priceCents,
    brand,
    model,
    status,
    purchaseDate: offset === null ? null : dateKey(day(offset)),
    notes: `${demoNote}${priceCents === null ? " 此条价格为空，用于验证未知价格不会被误记为购买金额。" : " 金额仅为示例购买记录。"}`,
    imageUrl: "",
    createdAt: day(-i, 8),
  }),
);

const subscriptionRows = [
  ["AI 助手", "效率工具", 14500, "月付", 2, "使用中"],
  ["云盘空间", "云服务", 2100, "月付", 1, "使用中"],
  ["音乐会员", "影音娱乐", 1800, "月付", 4, "使用中"],
  ["视频会员", "影音娱乐", 2500, "月付", 6, "使用中"],
  ["设计素材库", "效率工具", 29900, "年付", 3, "使用中"],
  ["在线课程", "学习成长", 39900, "年付", 20, "使用中"],
  ["密码管理器", "效率工具", 19800, "年付", 60, "使用中"],
  ["域名续费", "云服务", 8800, "年付", 120, "使用中"],
  ["健身课程", "学习成长", 6800, "月付", -2, "使用中"],
  ["有声书", "影音娱乐", 2800, "月付", 5, "已暂停"],
  ["旧笔记软件", "效率工具", 36000, "年付", 7, "已取消"],
  ["阅读通讯", "其他", 1200, "月付", 12, "使用中"],
];
const subscriptions = subscriptionRows.map(
  ([name, category, amountCents, cycle, offset, status], i) => ({
    id: `${prefix}-subscription-${i}`,
    name: `示例 · ${name}`,
    category,
    amountCents,
    cycle,
    startDate: dateKey(day(-180 - i * 7)),
    nextRenewal: dateKey(day(offset)),
    status,
    notes: `${demoNote} 金额为虚构示例，不代表任何服务的官方价格。${offset < 0 ? "本条故意保留已过续费日，检查到期提醒。" : ""}`,
    createdAt: day(-i * 2, 10),
  }),
);

const journalRows = [
  [
    "把注意力留给真正重要的事",
    "## 今天的一点发现\n\n忙碌不一定意味着前进。真正让项目有变化的，往往是没有被打断的那两个小时。\n\n- 先确定今天最重要的一件事\n- 留出完整的时间块\n- 做完以后再处理消息\n\n> 专注是一种可以主动创造的环境。",
    ["工作", "成长"],
    0,
    true,
    true,
  ],
  [
    "少一点拥有，多一点使用",
    "整理桌面时发现，真正每天使用的物品其实并不多。\n\n比起不断添置，更值得做的是：让已经拥有的东西发挥价值。下次购买前，先想清楚它会在什么场景里被使用。",
    ["生活", "反思"],
    1,
    false,
    true,
  ],
  [
    "",
    "散步的时候，不带耳机也很好。风声、脚步声、路边的小店，让人重新回到眼前的生活。",
    ["情绪", "生活"],
    2,
    false,
    false,
  ],
  [
    "记录，而不是评判",
    "有时写下情绪，就已经让它变得轻了一点。\n\n不必马上给自己一个结论。先描述发生了什么、自己在意什么，再慢慢找答案。",
    ["情绪", "反思"],
    3,
    false,
    true,
  ],
  [
    "一个关于工作台的小想法",
    "希望自己的数字空间，能像一张干净的书桌。\n\n### 我需要的\n\n1. 知道接下来做什么\n2. 看见已经完成的事\n3. 随时留下一个念头\n\n### 我不需要的\n\n复杂的仪式感，和为了记录而记录。",
    ["灵感", "工作"],
    4,
    true,
    false,
  ],
  [
    "阅读之后，留一个行动",
    "读完一章书，与其摘抄很多句子，不如留下一个可以在明天试试的小行动。\n\n**本次行动：** 上午开始工作前，先把手机放到另一个房间。",
    ["学习", "成长"],
    5,
    false,
    false,
  ],
  [
    "本周的小复盘",
    "| 保留 | 调整 |\n| --- | --- |\n| 晨间专注工作 | 缩短无目标浏览 |\n| 傍晚运动 | 提前安排休息 |\n| 随手记录想法 | 每周整理一次笔记 |\n\n做得不完美也没有关系，能继续就是进展。",
    ["反思", "成长"],
    6,
    false,
    true,
  ],
  [
    "支出背后的价值",
    "每月回看订阅，比只看总额更有用的是问一句：过去一个月，我真的用过它吗？\n\n付费购买的是帮助自己解决问题的能力，而不只是“拥有一个会员”。",
    ["生活", "反思"],
    7,
    false,
    false,
  ],
  [
    "慢慢建立节奏",
    "最近尝试给一天留出三个锚点：早上专注、傍晚运动、睡前阅读。\n\n日程不需要排满，但有几个稳定的习惯，会让生活更踏实。",
    ["成长", "生活"],
    10,
    false,
    false,
  ],
  [
    "灵感来自连接",
    "把刚学到的一个概念，用自己的话解释给别人听，常常比再读一遍更能发现盲点。\n\n下次学习新知识，可以试试写一个具体的小例子。",
    ["灵感", "学习"],
    15,
    false,
    true,
  ],
  [
    "允许自己休息",
    "休息并不是奖励，而是日常的一部分。\n\n把它写进日历，是提醒自己：恢复精力也值得被认真对待。",
    ["人生", "情绪"],
    32,
    false,
    false,
  ],
  [
    "给未来的自己",
    "希望过一段时间再回头看，能从这些短短的记录里，看见自己如何一点点变得清楚。\n\n今天先写下第一句。",
    ["人生", "成长"],
    40,
    false,
    false,
  ],
];
const journals = journalRows.map(
  ([title, content, tags, offset, pinned, favorite], i) => {
    const createdAt =
      offset === 0 ? new Date(+now - 300000) : day(-offset, 20, 30);
    return {
      id: `${prefix}-journal-${i}`,
      title: title ? `示例 · ${title}` : "",
      content: `${content}\n\n---\n*示例笔记，用于检查 Markdown、标签及记录时间。*`,
      tags: JSON.stringify([...tags, "示例"]),
      pinned,
      favorite,
      createdAt,
      updatedAt: createdAt,
    };
  },
);

try {
  const before = await Promise.all([
    db.calendarEvent.count(),
    db.item.count(),
    db.subscription.count(),
    db.journalEntry.count(),
  ]);
  await db.$transaction([
    ...events.map((data) =>
      db.calendarEvent.upsert({
        where: { id: data.id },
        create: data,
        update: {},
      }),
    ),
    ...items.map((data) =>
      db.item.upsert({ where: { id: data.id }, create: data, update: {} }),
    ),
    ...subscriptions.map((data) =>
      db.subscription.upsert({
        where: { id: data.id },
        create: data,
        update: {},
      }),
    ),
    ...journals.map((data) =>
      db.journalEntry.upsert({
        where: { id: data.id },
        create: data,
        update: {},
      }),
    ),
  ]);
  const after = await Promise.all([
    db.calendarEvent.count(),
    db.item.count(),
    db.subscription.count(),
    db.journalEntry.count(),
  ]);
  console.log(
    JSON.stringify(
      {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        before,
        added: after.map((n, i) => n - before[i]),
        after,
        order: ["events", "items", "subscriptions", "journals"],
      },
      null,
      2,
    ),
  );
} finally {
  await db.$disconnect();
}
