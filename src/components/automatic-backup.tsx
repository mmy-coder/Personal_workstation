"use client";
import { useEffect, useState } from "react";
import type { BackupStatus, BackupSettings } from "@/lib/backup-settings";
import { requestJSON } from "@/lib/http";
import { Button } from "./ui/button";

export function AutomaticBackup({
  onBusy,
}: {
  onBusy: (busy: boolean) => void;
}) {
  const [status, setStatus] = useState<BackupStatus>();
  const [settings, setSettings] = useState<BackupSettings>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    requestJSON<BackupStatus>("/api/backups", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((result) => {
        setStatus(result);
        setSettings(result.settings);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, []);
  async function run(method: "POST" | "PATCH" | "GET") {
    if (busy) return;
    setBusy(true);
    onBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await requestJSON<BackupStatus>("/api/backups", {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "PATCH" ? { body: JSON.stringify(settings) } : {}),
      });
      setStatus(result);
      setSettings(result.settings);
      setMessage(
        method === "POST"
          ? "备份已保存到本机。"
          : method === "PATCH"
            ? "备份设置已保存。"
            : "",
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section className="backup-restore">
      <strong>自动备份</strong>
      <p className="muted">
        仅在本地服务运行时执行；错过的备份会在下次启动后补做一次。文件保存在本机，建议定期下载到其他设备。
      </p>
      {settings && (
        <fieldset disabled={busy} className="backup-controls">
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) =>
                setSettings({ ...settings, enabled: e.target.checked })
              }
            />
            启用自动备份
          </label>
          <label>
            备份间隔（小时）
            <input
              aria-label="备份间隔（小时）"
              type="number"
              min={1}
              max={168}
              value={settings.intervalHours}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  intervalHours: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            保留份数
            <input
              aria-label="保留份数"
              type="number"
              min={1}
              max={30}
              value={settings.retain}
              onChange={(e) =>
                setSettings({ ...settings, retain: Number(e.target.value) })
              }
            />
          </label>
          <div className="page-actions">
            <Button variant="outline" onClick={() => void run("PATCH")}>
              保存备份设置
            </Button>
            <Button onClick={() => void run("POST")}>立即备份</Button>
          </div>
        </fieldset>
      )}
      {busy && <p role="status">正在处理备份…</p>}
      {message && <p role="status">{message}</p>}
      {(error || status?.lastError) && (
        <p className="form-error" role="alert">
          {error || status?.lastError}
        </p>
      )}
      {error && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void run("GET")}
        >
          刷新备份列表
        </Button>
      )}
      {status && (
        <details>
          <summary>本机备份（{status.files.length} 份）</summary>
          {status.files.length ? (
            <ul className="backup-files">
              {status.files.map((file) => (
                <li key={file.name}>
                  <a
                    href={`/api/backups?file=${encodeURIComponent(file.name)}`}
                    download
                  >
                    {new Date(file.createdAt).toLocaleString("zh-CN")} ·{" "}
                    {Math.ceil(file.bytes / 1024)} KB · 下载
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">暂无自动备份，可以立即创建一份。</p>
          )}
        </details>
      )}
    </section>
  );
}
