"use client";
import { useRef, useState } from "react";
import { Trash2, LoaderCircle, AlertTriangle } from "lucide-react";
import { useCloseGuard } from "./use-close-guard";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
import { Field } from "./ui/shared";
import { useData } from "./provider";
import { eventCategories, type CalendarEvent } from "@/lib/types";
import { inputDateTime } from "@/lib/dates";
import { schemas } from "@/lib/validation";
import { eventsURL } from "@/lib/workspace-url";
import { requestJSON } from "@/lib/http";
import { conflicts } from "@/lib/stats";
export function EventEditor({
  event,
  initialStart,
  onClose,
}: {
  event?: CalendarEvent;
  initialStart?: Date;
  onClose: () => void;
}) {
  const { save, remove } = useData();
  const submitting = useRef(false);
  const start = initialStart || new Date(new Date().setHours(14, 0, 0, 0));
  const [form, setForm] = useState({
    title: event?.title || "",
    description: event?.description || "",
    category: event?.category || "工作",
    start: inputDateTime(event ? new Date(event.start) : start),
    end: inputDateTime(
      event ? new Date(event.end) : new Date(+start + 3600000),
    ),
    completed: event?.completed || false,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmConflict, setConfirmConflict] = useState(false),
    [deleting, setDeleting] = useState(false);
  function field(key: keyof typeof form, value: string | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
    setConfirmConflict(false);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const parsed = schemas.events.safeParse({
        ...form,
        start: new Date(form.start).toISOString(),
        end: new Date(form.end).toISOString(),
      });
      if (!parsed.success) {
        setError(parsed.error.issues.map((i) => i.message).join("；"));
        return;
      }
      const events = await requestJSON<CalendarEvent[]>(
        eventsURL(new Date(parsed.data.start), new Date(parsed.data.end)),
      );
      if (
        conflicts(events, { ...parsed.data, id: event?.id }).length &&
        !confirmConflict
      ) {
        setConfirmConflict(true);
        return;
      }
      setBusy(true);
      await save("events", parsed.data, event?.id, event?.version);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function deleteRecord() {
    if (!event || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await remove("events", event.id, event.version);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const guard = useCloseGuard(form, busy, onClose);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) guard.close();
      }}
      title={event ? "编辑日程" : "安排一段时间"}
      description="留出专注的时间，也为生活保留空白。"
    >
      <form onSubmit={submit} className="editor-form" aria-busy={busy}>
        <fieldset disabled={busy} className="form-fields">
          {guard.prompt}
          <Field label="日程名称 *">
            <input
              autoFocus
              required
              maxLength={120}
              placeholder="这段时间，你想做什么？"
              value={form.title}
              onChange={(e) => field("title", e.target.value)}
            />
          </Field>
          <Field label="分类">
            <select
              value={form.category}
              onChange={(e) => field("category", e.target.value)}
            >
              {eventCategories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <div className="form-grid">
            <Field label="开始时间 *">
              <input
                type="datetime-local"
                required
                step={1800}
                value={form.start}
                onChange={(e) => field("start", e.target.value)}
              />
            </Field>
            <Field label="结束时间 *">
              <input
                type="datetime-local"
                required
                step={1800}
                value={form.end}
                onChange={(e) => field("end", e.target.value)}
              />
            </Field>
          </div>
          <Field label="描述">
            <textarea
              rows={3}
              placeholder="补充一些细节…"
              value={form.description}
              onChange={(e) => field("description", e.target.value)}
            />
          </Field>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.completed}
              onChange={(e) => field("completed", e.target.checked)}
            />
            标记为已完成<span>完成时长将同步至总览</span>
          </label>
          {confirmConflict && (
            <div className="warning" role="alert">
              <AlertTriangle size={18} />
              <span>与已有日程存在时间冲突。你仍可选择“仍然保存”。</span>
            </div>
          )}
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
            {event && (
              <Button
                type="button"
                variant="ghost"
                className="danger-text"
                disabled={busy}
                onClick={() => setDeleting(true)}
              >
                <Trash2 size={16} />
                删除
              </Button>
            )}
            <div className="form-footer-right">
              <Button
                type="button"
                variant="outline"
                onClick={guard.close}
                disabled={busy}
              >
                取消
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <LoaderCircle size={16} className="spin" />}
                {confirmConflict ? "仍然保存" : "保存日程"}
              </Button>
            </div>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
