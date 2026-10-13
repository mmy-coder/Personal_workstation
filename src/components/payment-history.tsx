"use client";
import { useEffect, useState } from "react";
import type { RecordPage, SubscriptionPayment } from "@/lib/types";
import { dateKey, money } from "@/lib/dates";
import { parseMoney } from "@/lib/validation";
import { useData } from "./provider";
import { useCloseGuard } from "./use-close-guard";
import { Empty, Field, Panel } from "./ui/shared";
import { Modal } from "./ui/dialog";
import { Button } from "./ui/button";
import { useRecords } from "./use-records";
import { usePageState } from "./use-page-state";
import { Pagination } from "./ui/pagination";
function PaymentEditor({
  payment,
  onClose,
}: {
  payment: SubscriptionPayment;
  onClose: () => void;
}) {
  const { save, remove } = useData();
  const [form, setForm] = useState({
    amount: (payment.amountCents / 100).toFixed(2),
    paidOn: payment.paidOn,
    notes: payment.notes,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState(false);
  const guard = useCloseGuard(form, busy, onClose);
  async function commit(deleting = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (deleting) await remove("payments", payment.id, payment.version);
      else {
        const amountCents = parseMoney(form.amount);
        if (amountCents === null) throw new Error("请填写金额");
        await save(
          "payments",
          { amountCents, paidOn: form.paidOn, notes: form.notes },
          payment.id,
          payment.version,
        );
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) guard.close();
      }}
      title={`付款记录 · ${payment.name}`}
      description={`对应到期日 ${payment.dueOn}。修改或删除付款记录不会回退订阅的续费日期。`}
    >
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          void commit();
        }}
      >
        <fieldset disabled={busy} className="form-fields">
          {guard.prompt}
          <Field label="实际付款金额（元）">
            <input
              required
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Field>
          <Field label="付款日期">
            <input
              required
              type="date"
              max={dateKey(new Date())}
              value={form.paidOn}
              onChange={(e) => setForm({ ...form, paidOn: e.target.value })}
            />
          </Field>
          <Field label="付款备注">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {deleting && (
            <div className="warning">
              确认删除这条付款记录？
              <Button
                type="button"
                variant="destructive"
                onClick={() => void commit(true)}
              >
                确认删除付款
              </Button>
            </div>
          )}
          <div className="form-footer">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleting(true)}
            >
              删除付款
            </Button>
            <Button type="submit">保存付款</Button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
export function PaymentHistory() {
  const [page, setPage] = usePageState("paymentPage", 1, (value) =>
    /^\d+$/.test(value) ? Math.max(1, Math.min(1000000, Number(value))) : 1,
  );
  const query = useRecords<RecordPage<SubscriptionPayment>>(
    `/api/payments?page=${page}`,
  );
  useEffect(() => {
    if (query.data && query.data.page !== page) setPage(query.data.page);
  }, [query.data, page, setPage]);
  const [editing, setEditing] = useState<SubscriptionPayment | null>(null);
  return (
    <>
      <Panel
        title="实际付款记录"
        subtitle="仅统计已确认的付款；订阅暂停或删除后仍保留历史记录。"
      >
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
            {query.loading ? "正在加载付款记录…" : "暂时无法加载付款记录"}
          </p>
        ) : query.data.entries.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>服务</th>
                  <th>付款日期</th>
                  <th>对应到期日</th>
                  <th>实际金额</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {query.data.entries.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.paidOn}</td>
                    <td>{p.dueOn}</td>
                    <td>{money(p.amountCents)}</td>
                    <td>
                      <Button variant="ghost" onClick={() => setEditing(p)}>
                        编辑付款
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="还没有实际付款记录"
            description="在订阅旁点击“确认续费”，记录已支付的金额。"
          />
        )}
        {query.data && (
          <Pagination
            {...query.data}
            loading={query.loading}
            label="付款分页"
            onPage={setPage}
          />
        )}
      </Panel>
      {editing && (
        <PaymentEditor payment={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}
