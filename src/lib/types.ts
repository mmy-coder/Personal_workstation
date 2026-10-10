export const eventCategories = [
  "工作",
  "学习",
  "生活",
  "运动",
  "休息",
  "自定义",
] as const;
export const itemCategories = [
  "数码设备",
  "书籍",
  "摄影器材",
  "家具",
  "生活用品",
  "其他",
];
export const subscriptionCategories = [
  "效率工具",
  "影音娱乐",
  "云服务",
  "学习成长",
  "其他",
];
export const categoryColors: Record<string, string> = {
  工作: "#5577cd",
  学习: "#8b70c5",
  生活: "#ce9552",
  运动: "#368e7b",
  休息: "#87909f",
  自定义: "#c27598",
  数码设备: "#5577cd",
  摄影器材: "#368e7b",
  家具: "#8b70c5",
  书籍: "#ce9552",
  生活用品: "#c27598",
  其他: "#87909f",
  效率工具: "#5577cd",
  影音娱乐: "#368e7b",
  云服务: "#8b70c5",
  学习成长: "#ce9552",
};
export type Base = {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type CalendarEvent = Base & {
  title: string;
  description: string;
  category: string;
  start: string;
  end: string;
  completed: boolean;
};
export type Item = Base & {
  name: string;
  category: string;
  priceCents: number | null;
  purchaseDate: string | null;
  brand: string;
  model: string;
  status: string;
  notes: string;
  imageUrl: string;
};
export type Subscription = Base & {
  name: string;
  category: string;
  amountCents: number;
  cycle: "月付" | "年付";
  startDate: string;
  nextRenewal: string;
  renewalAnchorDay?: number | null;
  status: string;
  notes: string;
};
export type JournalEntry = Base & {
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  favorite: boolean;
};
export type SubscriptionPayment = Base & {
  subscriptionId: string;
  name: string;
  category: string;
  amountCents: number;
  paidOn: string;
  dueOn: string;
  notes: string;
};
export type Data = {
  payments: SubscriptionPayment[];
  events: CalendarEvent[];
  items: Item[];
  subscriptions: Subscription[];
  journals: JournalEntry[];
};
export type Resource = keyof Data;
export type RecordType =
  CalendarEvent | Item | Subscription | JournalEntry | SubscriptionPayment;
export type JournalPreview = Omit<JournalEntry, "content"> & {
  excerpt: string;
};
export type JournalPage = {
  entries: JournalPreview[];
  total: number;
  page: number;
  pageSize: number;
};
export type WorkspaceData = Omit<Data, "journals"> & {
  journals: JournalPreview[];
  journalStats: {
    total: number;
    favorites: number;
    monthCount: number;
    tags: string[];
  };
};
