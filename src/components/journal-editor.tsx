"use client";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Pin,
  Star,
  Pencil,
  Eye,
  Trash2,
  LoaderCircle,
  Copy,
} from "lucide-react";
import { useData } from "./provider";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import type { JournalEntry } from "@/lib/types";
import {
  keepDraftActive,
  openDraft,
  listDrafts,
  type RecoveryDraft,
} from "@/lib/draft-storage";
import { RequestError, requestJSON } from "@/lib/http";
import {
  encodeJournalDraft,
  type JournalDraft as Draft,
} from "@/lib/journal-draft";
export function JournalEditor({
  entry,
  initialDraft,
  onClose,
}: {
  entry?: JournalEntry;
  initialDraft?: Draft;
  onClose: () => void;
}) {
  const { save, remove } = useData();
  const recordKey = entry?.id || "new";
  const [session] = useState(() => openDraft(recordKey, !!initialDraft));
  const { key, restored } = session;
  useEffect(() => keepDraftActive(key), [key]);
  const [recoveries, setRecoveries] = useState<RecoveryDraft[]>(() => {
    try {
      return listDrafts(recordKey).filter((d) => d.key !== key);
    } catch {
      return [];
    }
  });
  const [recoveryKey, setRecoveryKey] = useState("");
  const base: Draft = {
    title: entry?.title || "",
    content: entry?.content || "",
    tags: entry?.tags.join("，") || "",
    pinned: entry?.pinned || false,
    favorite: entry?.favorite || false,
  };
  const [form, setForm] = useState<Draft>(
    initialDraft || restored?.form || base,
  );
  const [draftVersion, setDraftVersion] = useState(
    restored ? restored.basedOnVersion : (entry?.version ?? null),
  );
  const draftConflict = !!entry && draftVersion !== entry.version;
  const [preview, setPreview] = useState(!!entry && !restored),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [draftStatus, setDraftStatus] = useState(
      restored ? "已恢复上次未保存的草稿" : "",
    ),
    [deleting, setDeleting] = useState(false),
    [conflicted, setConflicted] = useState(draftConflict),
    [latest, setLatest] = useState<JournalEntry | null>(null);
  const storageFailed = useRef(false),
    saved = useRef(false),
    submitting = useRef(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(base);
  useEffect(() => {
    try {
      if (!dirty) {
        localStorage.removeItem(key);
        setDraftStatus("");
      } else {
        localStorage.setItem(key, encodeJournalDraft(form, draftVersion));
        setDraftStatus("草稿已保存在此浏览器");
      }
      storageFailed.current = false;
    } catch {
      storageFailed.current = true;
      setDraftStatus("草稿保护不可用，请及时保存");
    }
  }, [form, key, dirty, draftVersion]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty && !saved.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function close() {
    if (submitting.current) return;
    if (
      dirty &&
      storageFailed.current &&
      !window.confirm("草稿无法自动保存，关闭会丢失修改。仍然关闭吗？")
    )
      return;
    onClose();
  }
  function clearDraft() {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Browser storage may be unavailable. */
    }
  }
  async function commit(asCopy = false) {
    if (submitting.current) return;
    if (draftConflict && !asCopy) {
      setError("这份草稿基于旧版本，请查看最新内容或另存为新笔记。");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await save(
        "journals",
        {
          ...form,
          tags: form.tags
            .split(/[,，\n]/)
            .map((t) => t.trim())
            .filter(Boolean),
        },
        asCopy ? undefined : entry?.id,
        asCopy ? undefined : entry?.version,
      );
      saved.current = true;
      clearDraft();
      onClose();
    } catch (e) {
      if (e instanceof RequestError && (e.status === 409 || e.status === 404))
        setConflicted(true);
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  function submit(e: React.FormEvent) {
    e.preventDefault();
    void commit();
  }
  async function deleteRecord() {
    if (!entry || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await remove("journals", entry.id, entry.version);
      saved.current = true;
      clearDraft();
      onClose();
    } catch (e) {
      if (e instanceof RequestError && (e.status === 409 || e.status === 404))
        setConflicted(true);
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function viewLatest() {
    try {
      setLatest(await requestJSON<JournalEntry>(`/api/journals/${entry!.id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function recoverDraft() {
    const selected = recoveries.find((d) => d.key === recoveryKey);
    if (!selected) return;
    if (dirty && !window.confirm("恢复会替换当前编辑框中的内容，是否继续？"))
      return;
    setForm(selected.draft.form);
    setDraftVersion(selected.draft.basedOnVersion);
    setConflicted(!!entry && selected.draft.basedOnVersion !== entry.version);
    setPreview(false);
    setRecoveryKey("");
  }
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <Modal
      open
      wide
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={entry ? "感悟笔记" : "记录一个想法"}
      description={
        entry
          ? `创建于 ${new Date(entry.createdAt).toLocaleString("zh-CN")} · 最后修改 ${new Date(entry.updatedAt).toLocaleString("zh-CN")}`
          : "短句或长文都好，先把这一刻留下来。"
      }
    >
      <form className="journal-editor" onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy} className="form-fields journal-fields">
          {recoveries.length > 0 && (
            <details className="draft-recovery">
              <summary>找回其他草稿（{recoveries.length}）</summary>
              <p>恢复为当前窗口的独立副本，不会清除其他窗口的草稿。</p>
              <select
                aria-label="选择恢复草稿"
                value={recoveryKey}
                onChange={(e) => setRecoveryKey(e.target.value)}
              >
                <option value="">选择一份草稿</option>
                {recoveries.map(({ key, draft }) => (
                  <option value={key} key={key}>
                    {draft.form.title ||
                      draft.form.content.slice(0, 24) ||
                      "空草稿"}{" "}
                    ·{" "}
                    {draft.savedAt
                      ? new Date(draft.savedAt).toLocaleString("zh-CN")
                      : "旧版草稿"}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                disabled={!recoveryKey}
                onClick={recoverDraft}
              >
                恢复此草稿
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={!recoveryKey}
                onClick={() => {
                  if (!window.confirm("确定删除这份恢复草稿？此操作无法撤销。"))
                    return;
                  try {
                    localStorage.removeItem(recoveryKey);
                    setRecoveries((rows) =>
                      rows.filter((r) => r.key !== recoveryKey),
                    );
                    setRecoveryKey("");
                  } catch {
                    setError("无法删除草稿，请检查浏览器存储权限。");
                  }
                }}
              >
                删除此草稿
              </Button>
            </details>
          )}
          {conflicted && (
            <div className="warning" role="alert">
              <span>
                原笔记已更新或删除，当前输入仍保留。你可以查看最新内容或另存为新笔记。
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={viewLatest}
              >
                查看最新内容
              </Button>
            </div>
          )}
          {latest && (
            <details className="latest-note" open>
              <summary>数据库中的最新版本（只读）</summary>
              <h3>{latest.title}</h3>
              <div className="markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {latest.content}
                </ReactMarkdown>
              </div>
            </details>
          )}
          <div className="journal-editor-toolbar">
            <div className="segmented">
              <button
                type="button"
                className={!preview ? "selected" : ""}
                onClick={() => setPreview(false)}
              >
                <Pencil size={14} />
                编辑
              </button>
              <button
                type="button"
                className={preview ? "selected" : ""}
                onClick={() => setPreview(true)}
              >
                <Eye size={14} />
                预览
              </button>
            </div>
            <div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={form.pinned ? "is-highlight" : ""}
                aria-label="置顶笔记"
                aria-pressed={form.pinned}
                onClick={() => set("pinned", !form.pinned)}
              >
                <Pin size={17} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={form.favorite ? "is-favorite" : ""}
                aria-label="收藏笔记"
                aria-pressed={form.favorite}
                onClick={() => set("favorite", !form.favorite)}
              >
                <Star
                  size={17}
                  fill={form.favorite ? "currentColor" : "none"}
                />
              </Button>
            </div>
          </div>
          {preview ? (
            <article className="markdown journal-preview">
              {form.title && <h1>{form.title}</h1>}
              {form.content.trim() ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {form.content}
                </ReactMarkdown>
              ) : (
                <p className="muted">写点内容，预览会出现在这里。</p>
              )}
            </article>
          ) : (
            <div className="journal-inputs">
              <input
                aria-label="笔记标题"
                className="journal-title-input"
                maxLength={120}
                placeholder="标题（可选）"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
              />
              <textarea
                aria-label="笔记正文"
                autoFocus={!entry}
                placeholder="此刻，你在想什么？\n\n支持 Markdown，自由写下就好。"
                value={form.content}
                onChange={(e) => set("content", e.target.value)}
              />
            </div>
          )}
          <div className="journal-tags-input">
            <span>标签</span>
            <input
              aria-label="笔记标签"
              placeholder="人生，工作，成长…（用逗号分隔）"
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {deleting && (
            <div className="warning">
              删除后无法撤销。
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={deleteRecord}
              >
                确认删除
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDeleting(false)}
              >
                保留
              </Button>
            </div>
          )}
          <div className="form-footer">
            <span className="draft-status">
              <span className="status-dot" />
              {draftStatus || "保存后同步至工作台"}
            </span>
            <div className="form-footer-right">
              {entry && conflicted && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void commit(true)}
                  disabled={busy}
                >
                  <Copy size={15} />
                  另存为新笔记
                </Button>
              )}
              {entry && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="danger-text"
                  aria-label="删除笔记"
                  disabled={busy}
                  onClick={() => setDeleting(true)}
                >
                  <Trash2 size={16} />
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={close}
              >
                关闭
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <LoaderCircle size={16} className="spin" />}保存笔记
              </Button>
            </div>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
