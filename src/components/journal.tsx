"use client";
import { usePageState, choice, useScrollMemory } from "./use-page-state";
import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  Pin,
  Star,
  ArrowUpRight,
  NotebookPen,
  Clock3,
} from "lucide-react";
import { useData } from "./provider";
import { Button } from "./ui/button";
import { Empty, PageHeading } from "./ui/shared";
import { shortDate } from "@/lib/dates";
import type { JournalEntry, JournalPreview, JournalPage } from "@/lib/types";
import { useJournalEditor } from "./use-journal-editor";
import { useRecords } from "./use-records";
import { DraftBox } from "./draft-box";
import { JournalEditor } from "./journal-editor";
export function Journal() {
  const { data, save, notify } = useData();
  const [search, setSearch] = usePageState("q", "", (value) =>
      value.slice(0, 200),
    ),
    [tag, setTag] = usePageState("tag", "全部笔记", (value) =>
      value.slice(0, 30),
    ),
    [sort, setSort] = usePageState<string>(
      "sort",
      "最近创建",
      choice(["最近创建", "最近修改", "最早创建"], "最近创建"),
    ),
    [onlyFavorite, setOnlyFavorite] = usePageState(
      "favorite",
      false,
      (value) => value === "true",
    );
  const [draftBox, setDraftBox] = useState(false);
  const notes = useJournalEditor();
  const { editor, opening } = notes;
  const [page, setPage] = usePageState("page", 1, (value) =>
      /^\d+$/.test(value) ? Math.max(1, Math.min(1000000, Number(value))) : 1,
    ),
    [queryText, setQueryText] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setQueryText(search), 200);
    return () => clearTimeout(timer);
  }, [search]);
  const tags = data.journalStats.tags;
  const query = useRecords<JournalPage>(
    `/api/journals?${new URLSearchParams({ page: String(page), q: queryText, tag: tag === "全部笔记" ? "" : tag, sort, favorite: String(onlyFavorite) })}`,
  );
  const entries = query.data?.entries || [];
  useScrollMemory(!!query.data);
  async function toggle(entry: JournalPreview, field: "pinned" | "favorite") {
    try {
      await save(
        "journals",
        { [field]: !entry[field] },
        entry.id,
        entry.version,
      );
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <>
      <PageHeading
        title="感悟笔记"
        description="捕捉一闪而过的念头，留给未来的自己。"
        action={
          <div className="page-actions">
            <Button
              variant="outline"
              onClick={() => {
                notes.close();
                setDraftBox(true);
              }}
            >
              草稿箱
            </Button>
            <Button onClick={() => notes.create()}>
              <Plus size={17} />
              记录一个想法
            </Button>
          </div>
        }
      />
      <div className="journal-intro">
        <span className="journal-intro-icon">
          <NotebookPen size={28} strokeWidth={1.4} />
        </span>
        <div>
          <h2>不必完整，值得记录就好。</h2>
          <p>
            已留下 <strong>{data.journalStats.total}</strong> 段思考，收藏了{" "}
            <strong>{data.journalStats.favorites}</strong> 个瞬间。
          </p>
        </div>
        <Button variant="ghost" onClick={() => notes.create()}>
          开始记录 <ArrowUpRight size={17} />
        </Button>
      </div>
      <div className="journal-controls">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="搜索笔记"
            placeholder="搜索文字、标题或标签…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            maxLength={200}
          />
        </div>
        <div className="list-filters">
          <Button
            variant={onlyFavorite ? "default" : "outline"}
            onClick={() => {
              setOnlyFavorite(!onlyFavorite);
              setPage(1);
            }}
          >
            <Star size={15} />
            仅收藏
          </Button>
          <select
            aria-label="笔记排序"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option>最近创建</option>
            <option>最近修改</option>
            <option>最早创建</option>
          </select>
        </div>
      </div>
      <div className="tag-filters">
        {["全部笔记", ...tags].map((t) => (
          <button
            key={t}
            className={tag === t ? "selected" : ""}
            onClick={() => {
              setTag(t);
              setPage(1);
            }}
          >
            {t === "全部笔记" ? t : `# ${t}`}
            {t === "全部笔记" && <span>{data.journalStats.total}</span>}
          </button>
        ))}
      </div>
      {opening && (
        <p className="query-status" role="status">
          正在打开笔记…
        </p>
      )}
      {query.error && (
        <div className="sync-warning" role="status">
          {query.error}
          <Button variant="outline" size="sm" onClick={query.retry}>
            重试
          </Button>
        </div>
      )}
      {query.loading && !query.data ? (
        <div className="loading" role="status">
          正在读取笔记…
        </div>
      ) : entries.length ? (
        <div className="journal-grid">
          {entries.map((entry) => (
            <article
              className={`note-card ${entry.pinned ? "note-pinned" : ""}`}
              key={entry.id}
            >
              <div className="note-meta">
                <span>
                  <Clock3 size={12} />
                  {shortDate(entry.createdAt)}
                </span>
                <div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${entry.pinned ? "取消置顶" : "置顶"}${entry.title || "笔记"}`}
                    className={entry.pinned ? "is-highlight" : ""}
                    onClick={() => void toggle(entry, "pinned")}
                  >
                    <Pin size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`${entry.favorite ? "取消收藏" : "收藏"}${entry.title || "笔记"}`}
                    className={entry.favorite ? "is-favorite" : ""}
                    onClick={() => void toggle(entry, "favorite")}
                  >
                    <Star
                      size={14}
                      fill={entry.favorite ? "currentColor" : "none"}
                    />
                  </Button>
                </div>
              </div>
              <button
                className="note-body"
                disabled={opening}
                onClick={() => void notes.open(entry.id)}
              >
                {entry.title && <h2>{entry.title}</h2>}
                <p>{entry.excerpt.replace(/[#*`>]/g, "")}</p>
              </button>
              <div className="note-bottom">
                <div>
                  {entry.tags.slice(0, 4).map((t) => (
                    <button
                      onClick={() => {
                        setTag(t);
                        setPage(1);
                      }}
                      className="tag"
                      key={t}
                    >
                      # {t}
                    </button>
                  ))}
                </div>
                <button
                  aria-label={`打开${entry.title || "笔记"}`}
                  disabled={opening}
                  onClick={() => void notes.open(entry.id)}
                >
                  <ArrowUpRight size={17} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : query.error ? null : (
        <section className="panel">
          <Empty
            title={
              data.journalStats.total
                ? "没有找到这段思考"
                : "第一条记录，从此刻开始"
            }
            description={
              data.journalStats.total
                ? "试试其他关键词，或调整标签与收藏筛选。"
                : "无需组织好语言，也不需要固定模板。"
            }
            action={
              <Button variant="outline" onClick={() => notes.create()}>
                <Plus size={16} />
                记录一个想法
              </Button>
            }
          />
        </section>
      )}
      {query.data && query.data.total > query.data.pageSize && (
        <nav className="pagination" aria-label="笔记分页">
          <span>
            共 {query.data.total} 篇 · 第 {query.data.page} /{" "}
            {Math.ceil(query.data.total / query.data.pageSize)} 页
          </span>
          <Button
            variant="outline"
            disabled={query.loading || query.data.page <= 1}
            onClick={() => setPage(query.data!.page - 1)}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            disabled={
              query.loading ||
              query.data.page * query.data.pageSize >= query.data.total
            }
            onClick={() => setPage(query.data!.page + 1)}
          >
            下一页
          </Button>
        </nav>
      )}
      {draftBox && (
        <DraftBox
          onClose={() => setDraftBox(false)}
          onRecover={(draft) => {
            setDraftBox(false);
            notes.create(draft);
          }}
        />
      )}
      {editor && (
        <JournalEditor
          key={editor.key}
          entry={editor.entry}
          initialDraft={editor.initialDraft}
          onClose={notes.close}
        />
      )}
    </>
  );
}
