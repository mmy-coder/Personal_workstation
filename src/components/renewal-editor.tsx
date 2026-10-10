"use client";
import { useRef, useState } from "react";
import type { Subscription } from "@/lib/types";
import { dateKey, money } from "@/lib/dates";
import { nextRenewalDate } from "@/lib/renewal";
import { parseMoney } from "@/lib/validation";
import { createRequest } from "@/lib/create-request";
import { requestJSON } from "@/lib/http";
import { useData } from "./provider";
import { useCloseGuard } from "./use-close-guard";
import { Modal } from "./ui/dialog";
import { Field } from "./ui/shared";
import { Button } from "./ui/button";
export function RenewalEditor({
  subscription: sub,
  onClose,
}: {
  subscription: Subscription;
  onClose: () => void;
}) {
  const { refresh, notify } = useData();
  const [form, setForm] = useState({
    amount: (sub.amountCents / 100).toFixed(2),
    paidOn: dateKey(new Date()),
    nextRenewal: nextRenewalDate(
      sub.nextRenewal,
      sub.cycle,
      sub.renewalAnchorDay,
    ),
    notes: "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submitting = useRef(false),
    guard = useCloseGuard(form, busy, onClose);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const amountCents = parseMoney(form.amount);
      if (amountCents === null) throw new Error("请填写实际付款金额");
      const body = {
        version: sub.version,
        amountCents,
        paidOn: form.paidOn,
        nextRenewal: form.nextRenewal,
        notes: form.notes,
      };
      const attempt = await createRequest(`renew:${sub.id}`, body);
      await requestJSON(`/api/subscriptions/${sub.id}/renew`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": attempt.token,
        },
        body: JSON.stringify(body),
      });
      attempt.complete();
      await refresh();
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("personal-os-updates");
        channel.postMessage("changed");
        channel.close();
      }
      notify("付款已记录，下次续费日期已更新");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) guard.close();
      }}
      title={`确认续费 · ${sub.name}`}
      description={`本期到期日 ${sub.nextRenewal} · 标准价格 ${money(sub.amountCents)}`}
    >
      <form onSubmit={submit} className="editor-form">
        <fieldset disabled={busy} className="form-fields">
          {guard.prompt}
          <p className="muted">
            记录一次已经发生的付款，并推进一期续费日期。逾期多期时不会自动补记历史付款。
          </p>
          <Field label="实际付款金额（元）">
            <input
              required
              inputMode="decimal"
              value={form.amount}
              onChange={(e) =>
                setForm((f) => ({ ...f, amount: e.target.value }))
              }
            />
          </Field>
          <div className="form-grid">
            <Field label="付款日期">
              <input
                required
                type="date"
                max={dateKey(new Date())}
                value={form.paidOn}
                onChange={(e) =>
                  setForm((f) => ({ ...f, paidOn: e.target.value }))
                }
              />
            </Field>
            <Field label="下次续费日期">
              <input
                required
                type="date"
                value={form.nextRenewal}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nextRenewal: e.target.value }))
                }
              />
            </Field>
          </div>
          <Field label="付款备注">
            <textarea
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </Field>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <div className="form-footer-right">
            <Button type="button" variant="outline" onClick={guard.close}>
              取消
            </Button>
            <Button type="submit">
              {busy ? "正在记录…" : "记录付款并更新续费"}
            </Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
