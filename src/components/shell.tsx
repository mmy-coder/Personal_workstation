"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Boxes,
  NotebookPen,
  Settings2,
  Sun,
  Moon,
  Command,
  Menu,
  Download,
  Check,
  X,
} from "lucide-react";
import { BackupRestore } from "./backup-restore";
import { AutomaticBackup } from "./automatic-backup";
import { ClockProvider, useNow } from "./clock-provider";
import { requestJSON } from "@/lib/http";
import type { Data } from "@/lib/types";
import { DataProvider, DataGate, useData } from "./provider";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
const links = [
  { href: "/", label: "总览", icon: LayoutDashboard },
  { href: "/calendar", label: "时间日历", icon: CalendarDays },
  { href: "/assets", label: "资产与订阅", icon: Boxes },
  { href: "/journal", label: "感悟笔记", icon: NotebookPen },
];
function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname(),
    { notify } = useData();
  const [restoring, setRestoring] = useState(false),
    [backingUp, setBackingUp] = useState(false),
    [exporting, setExporting] = useState(false),
    [dark, setDark] = useState(false),
    [settings, setSettings] = useState(false),
    [menu, setMenu] = useState(false);
  const now = useNow();
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  function toggle() {
    const value = !dark;
    setDark(value);
    document.documentElement.classList.toggle("dark", value);
    try {
      localStorage.setItem("personal-os-theme", value ? "dark" : "light");
    } catch {
      notify("主题已切换，浏览器未允许保存偏好", true);
    }
  }
  async function exportData() {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await requestJSON<Data>("/api/data", { cache: "no-store" });
      const blob = new Blob(
        [
          JSON.stringify(
            { version: 1, exportedAt: new Date().toISOString(), ...data },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `personal-os-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify("数据副本已导出");
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="nav-backdrop"
          aria-label="关闭导航"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "sidebar-open" : ""}`}>
        <Link className="brand" href="/" onClick={() => setMenu(false)}>
          <span className="brand-mark">
            <Command size={23} />
          </span>
          <span>
            Personal OS<small>个人工作台</small>
          </span>
        </Link>
        <div className="nav-label">我的空间</div>
        <nav>
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={path === href ? "nav-link active" : "nav-link"}
              onClick={() => setMenu(false)}
            >
              <Icon size={19} strokeWidth={1.7} />
              {label}
              {path === href && <span className="nav-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="status-dot" />
            <span>把日子，过得有迹可循。</span>
          </div>
          <button
            className="nav-link"
            onClick={() => {
              setSettings(true);
              setMenu(false);
            }}
          >
            <Settings2 size={18} />
            设置与数据
          </button>
          <div className="profile">
            <span className="avatar">我</span>
            <div>
              个人空间<small>为自己留一处秩序</small>
            </div>
            <Check size={15} />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu"
              onClick={() => setMenu(!menu)}
              aria-label="打开导航"
            >
              {menu ? <X /> : <Menu />}
            </Button>
            <span>我的工作台</span>
            <span>/</span>
            <strong>
              {links.find((l) => l.href === path)?.label || "个人空间"}
            </strong>
          </div>
          <div className="topbar-actions">
            <span className="current-date">
              {now?.toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              })}
            </span>
            <span className="top-divider" />
            <Button
              variant="ghost"
              size="icon"
              onClick={toggle}
              aria-label={dark ? "切换浅色主题" : "切换深色主题"}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            <span className="avatar avatar-small">我</span>
          </div>
        </header>
        <main>
          <DataGate>{children}</DataGate>
        </main>
        <footer className="app-footer">
          Personal OS<span>专注当下，积累日常。</span>
        </footer>
      </div>
      <Modal
        open={settings}
        onOpenChange={(open) => {
          if (!restoring && !backingUp) setSettings(open);
        }}
        title="设置与数据"
        description="你的个人空间，由你掌握。"
      >
        <div className="settings-body">
          <div className="settings-row">
            <div>
              <strong>外观主题</strong>
              <p>偏好保存在当前浏览器</p>
            </div>
            <Button variant="outline" onClick={toggle}>
              {dark ? "切换浅色" : "切换深色"}
            </Button>
          </div>
          <div className="settings-row">
            <div>
              <strong>导出所有记录</strong>
              <p>下载可阅读的 JSON 数据副本</p>
            </div>
            <Button
              variant="outline"
              disabled={exporting}
              onClick={() => void exportData()}
            >
              <Download size={16} />
              {exporting ? "正在导出…" : "导出数据"}
            </Button>
          </div>
          <BackupRestore onBusy={setRestoring} />
          <AutomaticBackup onBusy={setBackingUp} />
          <div className="info-box">
            当前时区：{now && Intl.DateTimeFormat().resolvedOptions().timeZone}
            <br />
            周一为每周开始，金额以人民币显示。所有记录保存在本地数据库中。完整备份与恢复方法请查看项目
            README。
          </div>
        </div>
      </Modal>
    </div>
  );
}
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ClockProvider>
      <DataProvider>
        <Frame>{children}</Frame>
      </DataProvider>
    </ClockProvider>
  );
}
