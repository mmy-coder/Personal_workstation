"use client";
import { useState } from "react";
import { Upload, LoaderCircle } from "lucide-react";
import {
  backupKinds,
  backupLabels,
  backupLimit,
  type RestorePreview,
} from "@/lib/backup";
import { requestJSON } from "@/lib/http";
import { Button } from "./ui/button";
import { useData } from "./provider";
export function BackupRestore({ onBusy }: { onBusy: (busy: boolean) => void }) {
  const { refresh, notify } = useData();
  const [backup, setBackup] = useState<unknown>(),
    [preview, setPreview] = useState<RestorePreview | null>(null),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(""),
    [filename, setFilename] = useState(""),
    [done, setDone] = useState(false);
  function loading(value: boolean) {
    setBusy(value);
    onBusy(value);
  }
  async function inspect(file?: File) {
    if (!file || busy) return;
    loading(true);
    setError("");
    setPreview(null);
    setConfirmed(false);
    setDone(false);
    setBackup(undefined);
    setFilename(file.name);
    try {
      if (file.size > backupLimit - 100)
        throw new Error("请选择小于 20 MB 的备份文件。");
      let value: unknown;
      try {
        value = JSON.parse(await file.text());
      } catch {
        throw new Error("文件不是有效 JSON，请选择工作台导出的备份。");
      }
      const result = await requestJSON<RestorePreview>("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "preview", backup: value }),
      });
      setBackup(value);
      setPreview(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      loading(false);
    }
  }
  async function restore() {
    if (!confirmed || busy || !preview) return;
    loading(true);
    setError("");
    try {
      const result = await requestJSON<RestorePreview>("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "restore", backup }),
      });
      setPreview(result);
      setDone(true);
      await refresh();
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("personal-os-updates");
        channel.postMessage("changed");
        channel.close();
      }
      notify("备份恢复完成，已有记录保持不变");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      loading(false);
    }
  }
  const additions = preview
    ? backupKinds.reduce((sum, kind) => sum + preview.counts[kind].add, 0)
    : 0;
  return (
    <section className="backup-restore">
      <div className="settings-row">
        <div>
          <strong>从备份恢复</strong>
          <p>补回缺失记录，跳过已有记录及已经恢复的记录。</p>
        </div>
        <label className={`button button-outline ${busy ? "disabled" : ""}`}>
          <Upload size={16} />
          选择备份
          <input
            type="file"
            aria-label="选择备份文件"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              void inspect(e.target.files?.[0]);
              e.target.value = "";
            }}
            className="backup-file-input"
          />
        </label>
      </div>
      {busy && (
        <p className="query-status" role="status">
          <LoaderCircle size={14} className="spin" />
          正在处理，请稍候…
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <div className="backup-preview">
          <h3>{done ? "恢复完成" : "恢复预览"}</h3>
          <p className="muted">{filename}</p>
          <table>
            <thead>
              <tr>
                <th>类型</th>
                <th>文件记录</th>
                <th>{done ? "已恢复" : "将恢复"}</th>
                <th>跳过已有</th>
              </tr>
            </thead>
            <tbody>
              {backupKinds.map((kind) => (
                <tr key={kind}>
                  <td>{backupLabels[kind]}</td>
                  <td>{preview.counts[kind].total}</td>
                  <td>{preview.counts[kind].add}</td>
                  <td>{preview.counts[kind].skip}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {done ? (
            <p role="status">
              已补回 {additions} 条记录。
              {preview.safetyCopy && (
                <>
                  恢复前副本已保存至：
                  <code className="backup-path">{preview.safetyCopy}</code>
                </>
              )}
            </p>
          ) : additions ? (
            <>
              <p>
                执行前会自动保存当前数据副本。恢复将一次性完成，失败时全部回滚。
              </p>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                我已核对预览，确认补回缺失记录
              </label>
              <Button
                disabled={!confirmed || busy}
                onClick={() => void restore()}
              >
                确认恢复 {additions} 条记录
              </Button>
            </>
          ) : (
            <p role="status">没有需要补回的记录，当前数据不会改变。</p>
          )}
        </div>
      )}
    </section>
  );
}
