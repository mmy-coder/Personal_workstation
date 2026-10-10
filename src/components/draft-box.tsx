"use client";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  allDrafts,
  duplicateDrafts,
  removeDraftSnapshots,
  type StoredDraft,
} from "@/lib/draft-storage";
import type { JournalDraft } from "@/lib/journal-draft";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
import { Empty } from "./ui/shared";
export function DraftBox({
  onClose,
  onRecover,
}: {
  onClose: () => void;
  onRecover: (draft: JournalDraft) => void;
}) {
  const [rows, setRows] = useState<StoredDraft[]>([]),
    [selected, setSelected] = useState<StoredDraft | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [confirm, setConfirm] = useState<StoredDraft[] | null>(null);
  function load() {
    try {
      setRows(allDrafts());
      setError("");
    } catch {
      setError("无法读取浏览器草稿，请检查存储权限。");
    }
  }
  useEffect(() => {
    load();
    const changed = () => load();
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  function remove() {
    if (!confirm) return;
    try {
      const count = removeDraftSnapshots(confirm);
      setMessage(`已删除 ${count} 份草稿；正在编辑或已变化的草稿会保留。`);
      setConfirm(null);
      setSelected(null);
      load();
    } catch {
      setError("清理失败，未完成的草稿仍会保留。");
    }
  }
  const duplicates = duplicateDrafts(rows);
  return (
    <Modal
      open
      wide
      title="草稿箱"
      description="仅保存在当前浏览器。即使原笔记已删除，也可以预览并另存为新笔记。"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <div className="draft-box">
        <div className="draft-box-toolbar">
          <span>
            共 {rows.length} 份草稿 · {duplicates.length} 份重复副本
          </span>
          <Button
            variant="outline"
            disabled={!duplicates.length}
            onClick={() => setConfirm(duplicates)}
          >
            整理重复草稿
          </Button>
        </div>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
        {confirm && (
          <div className="warning">
            <span>
              确认删除这 {confirm.length}{" "}
              份草稿？重复整理会保留每组至少一份，并跳过正在编辑的草稿。
            </span>
            <Button variant="destructive" onClick={remove}>
              确认清理
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              保留草稿
            </Button>
          </div>
        )}
        {rows.length ? (
          <div className="draft-box-list">
            {rows.map((row) => (
              <div className="draft-box-row" key={row.key}>
                <button onClick={() => setSelected(row)}>
                  <strong>
                    {row.draft.form.title ||
                      row.draft.form.content.slice(0, 35) ||
                      "空草稿"}
                  </strong>
                  <small>
                    {row.draft.savedAt
                      ? new Date(row.draft.savedAt).toLocaleString("zh-CN")
                      : "旧版草稿"}{" "}
                    · {row.record === "new" ? "未命名新笔记" : "笔记编辑草稿"}
                    {row.active && " · 正在编辑"}
                  </small>
                </button>
                <Button
                  variant="ghost"
                  disabled={row.active}
                  onClick={() => setConfirm([row])}
                >
                  删除草稿
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="没有未保存的草稿"
            description="编辑中未保存的想法会出现在这里。"
          />
        )}
        {selected && (
          <section className="draft-box-preview">
            <h3>{selected.draft.form.title || "草稿预览"}</h3>
            <div className="markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {selected.draft.form.content}
              </ReactMarkdown>
            </div>
            <Button onClick={() => onRecover(selected.draft.form)}>
              另存为新笔记
            </Button>
            <p className="muted">
              打开独立副本继续编辑；原草稿会保留，保存后可回到这里清理。
            </p>
          </section>
        )}
      </div>
    </Modal>
  );
}
