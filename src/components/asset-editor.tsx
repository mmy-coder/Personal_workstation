"use client";
import { useRef, useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useCloseGuard } from "./use-close-guard";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
import { Field } from "./ui/shared";
import { useData } from "./provider";
import { dateKey } from "@/lib/dates";
import {
  itemCategories,
  subscriptionCategories,
  type Item,
  type Subscription,
} from "@/lib/types";
import { parseMoney } from "@/lib/validation";
export function AssetEditor({
  kind,
  record,
  onClose,
}: {
  kind: "items" | "subscriptions";
  record?: Item | Subscription;
  onClose: () => void;
}) {
  const isItem = kind === "items",
    item = isItem ? (record as Item | undefined) : undefined,
    sub = !isItem ? (record as Subscription | undefined) : undefined;
  const { save, remove } = useData();
  const submitting = useRef(false);
  const [form, setForm] = useState({
    name: record?.name || "",
    category:
      record?.category ||
      (isItem ? itemCategories[0] : subscriptionCategories[0]),
    amount:
      item?.priceCents != null
        ? (item.priceCents / 100).toFixed(2)
        : sub
          ? (sub.amountCents / 100).toFixed(2)
          : "",
    purchaseDate: item?.purchaseDate || "",
    brand: item?.brand || "",
    model: item?.model || "",
    status: record?.status || "使用中",
    notes: record?.notes || "",
    imageUrl: item?.imageUrl || "",
    cycle: sub?.cycle || "月付",
    startDate: sub?.startDate || dateKey(new Date()),
    nextRenewal: sub?.nextRenewal || dateKey(new Date()),
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false);
  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    setBusy(true);
    try {
      const amount = parseMoney(form.amount);
      if (!isItem && amount === null) throw new Error("请填写付款金额");
      const common = {
        name: form.name,
        category: form.category,
        status: form.status,
        notes: form.notes,
      };
      const body = isItem
        ? {
            ...common,
            priceCents: amount,
            purchaseDate: form.purchaseDate || null,
            brand: form.brand,
            model: form.model,
            imageUrl: form.imageUrl,
          }
        : {
            ...common,
            amountCents: amount,
            cycle: form.cycle,
            startDate: form.startDate,
            nextRenewal: form.nextRenewal,
          };
      await save(kind, body, record?.id, record?.version);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function deleteRecord() {
    if (!record || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await remove(kind, record.id, record.version);
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
      title={`${record ? "编辑" : "添加"}${isItem ? "物品" : "订阅"}`}
      description={
        isItem
          ? "记录拥有的物品，了解每一笔投入。"
          : "掌握持续支出，把续费放在心上。"
      }
    >
      <form className="editor-form" onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy} className="form-fields">
          {guard.prompt}
          <Field label={`${isItem ? "物品" : "订阅"}名称 *`}>
            <input
              autoFocus
              required
              maxLength={120}
              placeholder={isItem ? "例如：MacBook Pro" : "例如：iCloud"}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <div className="form-grid">
            <Field label="分类">
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              >
                {(isItem ? itemCategories : subscriptionCategories).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="状态">
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                {(isItem
                  ? ["使用中", "闲置", "已出售", "已丢弃"]
                  : ["使用中", "已暂停", "已取消"]
                ).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="form-grid">
            <Field label={isItem ? "购买价格（元）" : "每期付款金额（元）*"}>
              <input
                inputMode="decimal"
                required={!isItem}
                placeholder={isItem ? "可留空" : "0.00"}
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
              />
            </Field>
            {isItem ? (
              <Field label="购买日期">
                <input
                  type="date"
                  value={form.purchaseDate}
                  onChange={(e) => set("purchaseDate", e.target.value)}
                />
              </Field>
            ) : (
              <Field label="计费周期">
                <select
                  value={form.cycle}
                  onChange={(e) => set("cycle", e.target.value)}
                >
                  <option>月付</option>
                  <option>年付</option>
                </select>
              </Field>
            )}
          </div>
          {isItem ? (
            <>
              <div className="form-grid">
                <Field label="品牌">
                  <input
                    value={form.brand}
                    maxLength={120}
                    onChange={(e) => set("brand", e.target.value)}
                  />
                </Field>
                <Field label="型号">
                  <input
                    value={form.model}
                    maxLength={120}
                    onChange={(e) => set("model", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="图片网址（可选）">
                <input
                  type="url"
                  placeholder="https://…"
                  value={form.imageUrl}
                  onChange={(e) => set("imageUrl", e.target.value)}
                />
              </Field>
            </>
          ) : (
            <div className="form-grid">
              <Field label="开始日期 *">
                <input
                  required
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                />
              </Field>
              <Field label="下次续费日期 *">
                <input
                  required
                  type="date"
                  min={form.startDate}
                  value={form.nextRenewal}
                  onChange={(e) => set("nextRenewal", e.target.value)}
                />
              </Field>
            </div>
          )}
          <Field label="备注">
            <textarea
              rows={3}
              value={form.notes}
              placeholder="留下一些有用的信息…"
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {deleting && (
            <div className="warning">
              确定删除？此操作无法撤销。
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
            {record && (
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
                disabled={busy}
                onClick={guard.close}
              >
                取消
              </Button>
              <Button type="submit" disabled={busy}>
                {busy && <LoaderCircle size={16} className="spin" />}保存
                {isItem ? "物品" : "订阅"}
              </Button>
            </div>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
