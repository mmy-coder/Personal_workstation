"use client";
import { useRef, useState } from "react";
import type { BulkRecord, BulkResource } from "@/lib/bulk";
import {
  itemCategories,
  subscriptionCategories,
  eventCategories,
} from "@/lib/types";
import { requestJSON } from "@/lib/http";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { useData } from "./provider";

export function BulkEditor({
  resource,
  records,
  onClose,
}: {
  resource: BulkResource;
  records: BulkRecord[];
  onClose: () => void;
}) {
  // Keep the versions the user reviewed, even when another tab refreshes the list.
  const [snapshot] = useState(() => records.slice(0, 100));
  const [selected, setSelected] = useState<string[]>([]);
  const [action, setAction] = useState("category");
  const categories =
    resource === "items"
      ? itemCategories
      : resource === "subscriptions"
        ? subscriptionCategories
        : eventCategories;
  const [value, setValue] = useState<string>(categories[0]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const retry = useRef<{ body: string; token: string } | null>(null);
  const { refresh, notify } = useData();
  const options =
    action === "category"
      ? categories
      : resource === "items"
        ? ["使用中", "闲置", "已出售", "已丢弃"]
        : ["使用中", "已暂停", "已取消"];
  async function submit() {
    if (pending.current || !selected.length || !confirmed) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const operation =
      action === "delete"
        ? { action }
        : action === "complete"
          ? { action, value: value === "true" }
          : { action, value };
    const body = JSON.stringify({
      resource,
      records: snapshot
        .filter((record) => selected.includes(record.id))
        .map(({ id, version }) => ({ id, version })),
      operation,
    });
    if (retry.current?.body !== body)
      retry.current = { body, token: crypto.randomUUID() };
    try {
      const result = await requestJSON<{ count: number }>("/api/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": retry.current.token,
        },
        body,
      });
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("personal-os-updates");
        channel.postMessage("changed");
        channel.close();
      }
      await refresh();
      notify(
        `已批量${action === "delete" ? "删除" : "更新"} ${result.count} 条记录`,
      );
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !pending.current) onClose();
      }}
      title="批量管理"
      description="核对所选记录后确认。有任何版本冲突时，整批操作都会取消。"
    >
      <fieldset disabled={busy} className="bulk-form">
        <p className="muted">
          仅包含打开时当前页面或日历范围内的记录。每批最多 100 条。
          {records.length > 100 &&
            "当前仅列出前 100 条，请缩小日历范围后处理其余记录。"}
        </p>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={selected.length === snapshot.length && snapshot.length > 0}
            onChange={(e) => {
              setSelected(
                e.target.checked ? snapshot.map((record) => record.id) : [],
              );
              setConfirmed(false);
            }}
          />
          全选本批记录（{snapshot.length} 条）
        </label>
        <div className="bulk-records">
          {snapshot.map((record) => (
            <label key={record.id} className="checkbox-field">
              <input
                type="checkbox"
                checked={selected.includes(record.id)}
                onChange={(e) => {
                  setSelected((current) =>
                    e.target.checked
                      ? [...current, record.id]
                      : current.filter((id) => id !== record.id),
                  );
                  setConfirmed(false);
                }}
              />
              {record.name || record.title || record.id}
            </label>
          ))}
        </div>
        <label>
          批量操作
          <select
            aria-label="批量操作"
            value={action}
            onChange={(e) => {
              const next = e.target.value;
              setAction(next);
              setValue(
                next === "category"
                  ? categories[0]
                  : next === "complete"
                    ? "true"
                    : "使用中",
              );
              setConfirmed(false);
            }}
          >
            <option value="category">修改分类</option>
            {resource === "events" ? (
              <option value="complete">修改完成状态</option>
            ) : (
              <option value="status">修改状态</option>
            )}
            <option value="delete">删除记录</option>
          </select>
        </label>
        {action !== "delete" && (
          <label>
            目标值
            <select
              aria-label="目标值"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setConfirmed(false);
              }}
            >
              {action === "complete" ? (
                <>
                  <option value="true">已完成</option>
                  <option value="false">未完成</option>
                </>
              ) : (
                options.map((option) => <option key={option}>{option}</option>)
              )}
            </select>
          </label>
        )}
        {action === "delete" && (
          <p className="form-error">
            删除后无法直接撤销。订阅的历史付款记录会保留。
          </p>
        )}
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          我已核对所选 {selected.length} 条记录及操作
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="page-actions">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            disabled={!selected.length || !confirmed || busy}
            onClick={() => void submit()}
          >
            {busy
              ? "正在处理…"
              : `确认批量${action === "delete" ? "删除" : "修改"} ${selected.length} 条`}
          </Button>
        </div>
      </fieldset>
    </Modal>
  );
}
