"use client";
import { usePageState, choice, useScrollMemory } from "./use-page-state";
import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  Package,
  Wallet,
  Monitor,
  MoreHorizontal,
  BellRing,
  CircleDollarSign,
  Layers,
  Archive,
} from "lucide-react";
import { useRecords } from "./use-records";
import { useDebounced } from "./use-debounced";
import { Pagination } from "./ui/pagination";
import type { RecordPage } from "@/lib/types";
import { useData } from "./provider";
import { Button } from "./ui/button";
import { Empty, Metric, PageHeading, Panel } from "./ui/shared";
import { RenewalEditor } from "./renewal-editor";
import { PaymentHistory } from "./payment-history";
import { AssetEditor } from "./asset-editor";
import { DonutChart } from "./charts";
import {
  itemCategories,
  subscriptionCategories,
  type Item,
  type Subscription,
} from "@/lib/types";
import { monthlyCost, renewalDays } from "@/lib/stats";
import { money } from "@/lib/dates";
export function Assets() {
  const { data } = useData();
  const [renewing, setRenewing] = useState<Subscription | null>(null);
  const [tab, setTab] = usePageState(
      "tab",
      "items" as "items" | "subscriptions",
      choice(["items", "subscriptions"], "items"),
    ),
    [search, setSearch] = usePageState("q", "", (value) => value.slice(0, 200)),
    [category, setCategory] = usePageState<string>(
      "category",
      "全部分类",
      choice(
        ["全部分类", ...itemCategories, ...subscriptionCategories],
        "全部分类",
      ),
    ),
    [status, setStatus] = usePageState<string>(
      "status",
      "全部状态",
      choice(
        ["全部状态", "使用中", "闲置", "已出售", "已丢弃", "已暂停", "已取消"],
        "全部状态",
      ),
    ),
    [sort, setSort] = usePageState<string>(
      "sort",
      "最新添加",
      choice(["最新添加", "名称排序", "金额从高到低", "续费时间"], "最新添加"),
    ),
    [editor, setEditor] = useState<{ record?: Item | Subscription } | null>(
      null,
    );
  const [page, setPage] = usePageState("page", 1, (value) =>
    /^\d+$/.test(value) ? Math.max(1, Math.min(1000000, Number(value))) : 1,
  );
  const queryText = useDebounced(search);
  const query = useRecords<RecordPage<Item | Subscription>>(
    `/api/${tab}?${new URLSearchParams({ page: String(page), q: queryText, category: category === "全部分类" ? "" : category, status: status === "全部状态" ? "" : status, sort })}`,
  );
  const records = query.data?.entries || [];
  const stats = data.assetStats!;
  useScrollMemory(!!query.data);
  useEffect(() => {
    if (query.data && query.data.page !== page) setPage(query.data.page);
  }, [query.data, page, setPage]);
  const isItem = tab === "items",
    now = new Date();
  const active = data.subscriptions.filter((sub) => sub.status === "使用中");
  const aggregate = (kind: "count" | "amount") =>
    isItem
      ? kind === "count"
        ? stats.itemCategories
        : stats.itemAmounts
      : stats.subscriptionAmounts;
  const upcoming = active
    .filter((s) => renewalDays(s, now) <= 7)
    .sort((a, b) => a.nextRenewal.localeCompare(b.nextRenewal));
  function changeTab(next: typeof tab) {
    setPage(1);
    setTab(next);
    setCategory("全部分类");
    setStatus("全部状态");
    setSearch("");
    setSort("最新添加");
  }
  return (
    <>
      <PageHeading
        title="资产与订阅"
        description="清楚自己拥有什么，也清楚持续为哪些价值付费。"
        action={
          <Button onClick={() => setEditor({})}>
            <Plus size={17} />
            添加{isItem ? "物品" : "订阅"}
          </Button>
        }
      />
      <div className="tabs" role="tablist" aria-label="资产类型">
        <button
          role="tab"
          aria-selected={isItem}
          onClick={() => changeTab("items")}
          className={isItem ? "selected" : ""}
        >
          <Package size={17} />
          我的物品<span>{stats.items}</span>
        </button>
        <button
          role="tab"
          aria-selected={!isItem}
          onClick={() => changeTab("subscriptions")}
          className={!isItem ? "selected" : ""}
        >
          <Wallet size={17} />
          我的订阅<span>{stats.subscriptions}</span>
        </button>
      </div>
      <div className="metrics four-metrics">
        {isItem ? (
          <>
            <Metric
              label="物品总数"
              value={stats.items}
              unit="件"
              icon={<Layers />}
            />
            <Metric
              label="使用中"
              value={stats.inUse}
              unit="件"
              icon={<Monitor />}
            />
            <Metric
              label="闲置物品"
              value={stats.idle}
              unit="件"
              icon={<Archive />}
            />
            <Metric
              label="累计购买金额"
              value={money(stats.purchaseCents)}
              hint="已填写的购买价格之和"
              icon={<CircleDollarSign />}
              accent
            />
          </>
        ) : (
          <>
            <Metric
              label="活跃订阅"
              value={stats.active}
              unit="项"
              icon={<Layers />}
            />
            <Metric
              label="月均订阅成本"
              value={money(stats.monthlyCents)}
              hint="年付按 12 个月均摊"
              icon={<Wallet />}
              accent
            />
            <Metric
              label="年化订阅成本"
              value={money(stats.annualCents)}
              hint="仅统计使用中的订阅"
            />
            <Metric
              label="需要留意的续费"
              value={upcoming.length}
              unit="项"
              hint="未来 7 天及已到期订阅"
              icon={<BellRing />}
            />
          </>
        )}
      </div>
      {!isItem && upcoming.length > 0 && (
        <div className="renewal-banner">
          <BellRing size={19} />
          <div>
            <strong>续费提醒</strong>
            <span>
              {upcoming
                .map(
                  (s) =>
                    `${s.name}（${renewalDays(s, now) < 0 ? "续费日期已过" : renewalDays(s, now) === 0 ? "今天" : `${renewalDays(s, now)} 天后`}）`,
                )
                .join("、")}
            </span>
          </div>
        </div>
      )}
      <section className="panel records-panel">
        <div className="list-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="搜索记录"
              placeholder={
                isItem ? "搜索名称、品牌、备注…" : "搜索订阅名称、备注…"
              }
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="list-filters">
            <select
              aria-label="分类筛选"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option>全部分类</option>
              {(isItem ? itemCategories : subscriptionCategories).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              aria-label="状态筛选"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option>全部状态</option>
              {(isItem
                ? ["使用中", "闲置", "已出售", "已丢弃"]
                : ["使用中", "已暂停", "已取消"]
              ).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              aria-label="排序"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option>最新添加</option>
              <option>名称排序</option>
              <option>金额从高到低</option>
              {!isItem && <option>续费时间</option>}
            </select>
          </div>
        </div>
        {query.error && (
          <div className="sync-warning" role="status">
            {query.error}
            <Button variant="outline" onClick={query.retry}>
              重试
            </Button>
          </div>
        )}
        {!query.data ? (
          <p role="status" className="loading">
            {query.loading ? "正在加载记录…" : "暂时无法加载记录"}
          </p>
        ) : records.length === 0 ? (
          <Empty
            title={
              search || category !== "全部分类" || status !== "全部状态"
                ? "没有找到匹配的记录"
                : isItem
                  ? "从一件常用的物品开始"
                  : "把第一项订阅记在这里"
            }
            description={
              search
                ? "换个关键词试试。"
                : isItem
                  ? "电脑、耳机，或一本喜欢的书。"
                  : "月付、年付，每一项持续支出都值得了解。"
            }
            action={
              <Button variant="outline" onClick={() => setEditor({})}>
                <Plus size={16} />
                添加{isItem ? "物品" : "订阅"}
              </Button>
            }
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{isItem ? "物品" : "订阅服务"}</th>
                  <th>分类</th>
                  <th>{isItem ? "购买金额" : "付款金额"}</th>
                  <th>{isItem ? "购买日期" : "下次续费"}</th>
                  <th>状态</th>
                  <th>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const item = "priceCents" in record ? record : null,
                    sub = "nextRenewal" in record ? record : null;
                  return (
                    <tr key={record.id}>
                      <td>
                        <button
                          className="record-name"
                          onClick={() => setEditor({ record })}
                        >
                          <span className="item-icon">
                            {item?.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt=""
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            ) : isItem ? (
                              <Package size={20} />
                            ) : (
                              <Wallet size={20} />
                            )}
                          </span>
                          <span>
                            <strong>{record.name}</strong>
                            <small>
                              {item
                                ? [item.brand, item.model]
                                    .filter(Boolean)
                                    .join(" ") || "—"
                                : `${sub?.cycle} · 月均 ${money(monthlyCost(sub!))}`}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <span className="category-badge">
                          {record.category}
                        </span>
                      </td>
                      <td className="number">
                        {item
                          ? item.priceCents === null
                            ? "未填写"
                            : money(item.priceCents)
                          : money(sub!.amountCents)}
                        {sub && (
                          <small className="muted">
                            {" "}
                            / {sub.cycle === "月付" ? "月" : "年"}
                          </small>
                        )}
                      </td>
                      <td>
                        {item?.purchaseDate || sub?.nextRenewal || "—"}
                        {sub &&
                          sub.status === "使用中" &&
                          renewalDays(sub, now) <= 7 && (
                            <small className="renewal-text">
                              {renewalDays(sub, now) < 0
                                ? "日期已过，请核对"
                                : "即将续费"}
                            </small>
                          )}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${record.status === "使用中" ? "status-active" : ""}`}
                        >
                          <i />
                          {record.status}
                        </span>
                      </td>
                      <td>
                        {sub && sub.status === "使用中" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setRenewing(sub)}
                          >
                            确认续费
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`编辑${record.name}`}
                          onClick={() => setEditor({ record })}
                        >
                          <MoreHorizontal size={18} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-footer">
          共 {query.data?.total ?? 0} 条记录
          <span>
            {isItem
              ? "累计购买金额不代表当前资产市值"
              : "暂停与取消的订阅不计入活跃成本"}
          </span>
        </div>
        {query.data && (
          <Pagination
            {...query.data}
            loading={query.loading || search !== queryText}
            label="资产分页"
            onPage={setPage}
          />
        )}
      </section>
      <div className="two-columns">
        <Panel
          title={isItem ? "物品分类" : "订阅支出分布"}
          subtitle={isItem ? "按物品数量" : "按活跃订阅的月均成本"}
        >
          <DonutChart
            rows={aggregate(isItem ? "count" : "amount")}
            unit={isItem ? "件" : "元"}
            totalLabel={isItem ? "件物品" : "元 / 月"}
          />
        </Panel>
        {isItem ? (
          <Panel
            title="购买金额分布"
            subtitle={`累计购买 ${money(stats.purchaseCents)} · 按已填写价格`}
          >
            <DonutChart
              rows={aggregate("amount")}
              unit="元"
              totalLabel="累计购买"
              compactTotal
            />
          </Panel>
        ) : (
          <Panel title="即将续费" subtitle="未来 7 天及尚未更新的到期记录">
            {upcoming.length ? (
              <div className="compact-list">
                {upcoming.map((s) => (
                  <button
                    className="compact-row"
                    key={s.id}
                    onClick={() => setEditor({ record: s })}
                  >
                    <span className="item-icon">
                      <Wallet size={18} />
                    </span>
                    <span>
                      <strong>{s.name}</strong>
                      <small>
                        {s.nextRenewal} · {s.cycle}
                      </small>
                    </span>
                    <b>{money(s.amountCents)}</b>
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title="近期没有续费"
                description="未来七天，可以少一件挂心的事。"
              />
            )}
          </Panel>
        )}
      </div>
      {!isItem && <PaymentHistory />}
      {renewing && (
        <RenewalEditor
          subscription={renewing}
          onClose={() => setRenewing(null)}
        />
      )}
      {editor && (
        <AssetEditor
          kind={tab}
          record={editor.record}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  );
}
