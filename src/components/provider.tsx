"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertCircle, LoaderCircle } from "lucide-react";
import type {
  WorkspaceData,
  Resource,
  RecordType,
  JournalEntry,
} from "@/lib/types";
import { useNow } from "./clock-provider";
import { dateKey } from "@/lib/dates";
import { workspaceURL } from "@/lib/workspace-url";
import { createRequest } from "@/lib/create-request";
import { requestJSON } from "@/lib/http";
type Store = {
  data: WorkspaceData;
  loading: boolean;
  loaded: boolean;
  error: string;
  changeToken: number;
  refresh: () => Promise<void>;
  save: (
    resource: Resource,
    body: unknown,
    id?: string,
    version?: number,
  ) => Promise<RecordType>;
  remove: (resource: Resource, id: string, version: number) => Promise<void>;
  notify: (message: string, error?: boolean) => void;
};
const Context = createContext<Store | null>(null);
const empty: WorkspaceData = {
  events: [],
  items: [],
  subscriptions: [],
  journals: [],
  payments: [],
  journalStats: { total: 0, favorites: 0, monthCount: 0, tags: [] },
};
export function DataProvider({ children }: { children: React.ReactNode }) {
  const now = useNow();
  const day = now ? dateKey(now) : "";
  const lastDay = useRef("");
  const nextStart = useRef<number | null>(null);
  const [data, setData] = useState<WorkspaceData>(empty),
    [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const [changeToken, setChangeToken] = useState(0);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    revision = useRef(0),
    sequence = useRef(0);
  const pending = useRef(new Set<string>()),
    controller = useRef<AbortController | null>(null),
    channel = useRef<BroadcastChannel | null>(null);
  const notify = useCallback((message: string, error = false) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, error });
    timer.current = setTimeout(() => setToast(null), 4500);
  }, []);
  const refresh = useCallback(async () => {
    if (pending.current.size) return;
    const current = ++sequence.current,
      version = revision.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    try {
      const result = await requestJSON<WorkspaceData>(workspaceURL(), {
        cache: "no-store",
        signal: abort.signal,
      });
      if (current !== sequence.current || version !== revision.current) return;
      setData(result);
      setLoaded(true);
      setError("");
      setChangeToken((v) => v + 1);
    } catch (e) {
      if (
        abort.signal.aborted ||
        current !== sequence.current ||
        version !== revision.current
      )
        return;
      setError(e instanceof Error ? e.message : "数据加载失败");
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("personal-os-updates");
      channel.current.onmessage = focus;
    }
    return () => {
      controller.current?.abort();
      window.removeEventListener("focus", focus);
      channel.current?.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);
  useEffect(() => {
    if (!day) return;
    if (lastDay.current && lastDay.current !== day) void refresh();
    lastDay.current = day;
  }, [day, refresh]);
  useEffect(() => {
    if (!now) return;
    if (nextStart.current !== null && +now >= nextStart.current) void refresh();
    const future = data.events
      .filter((e) => !e.completed && +new Date(e.start) > +now)
      .map((e) => +new Date(e.start));
    nextStart.current = future.length ? Math.min(...future) : null;
  }, [now, data.events, refresh]);
  function changed() {
    revision.current++;
    setError("");
    channel.current?.postMessage("changed");
  }
  const save = async (
    resource: Resource,
    body: unknown,
    id?: string,
    version?: number,
  ) => {
    const key = `${resource}/${id || "new"}`;
    if (pending.current.has(key)) throw new Error("正在保存，请稍候。");
    if (id && version === undefined)
      throw new Error("缺少记录版本，请重新打开记录。");
    pending.current.add(key);
    revision.current++;
    try {
      const attempt = !id
        ? await createRequest(`create:${resource}`, body)
        : null;
      const record = await requestJSON<RecordType>(
        `/api/${resource}${id ? `/${id}` : ""}`,
        {
          method: id ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            ...(attempt ? { "Idempotency-Key": attempt.token } : {}),
            ...(id ? { "If-Match": String(version) } : {}),
          },
          body: JSON.stringify(body),
        },
      );
      attempt?.complete();
      changed();
      const visibleRecord =
        resource === "journals"
          ? (() => {
              const { content, ...rest } = record as JournalEntry;
              return { ...rest, excerpt: content.slice(0, 300) };
            })()
          : record;
      setData((old) => ({
        ...old,
        [resource]: id
          ? old[resource].map((r) =>
              r.id === id && r.version <= record.version ? visibleRecord : r,
            )
          : [...old[resource].filter((r) => r.id !== record.id), visibleRecord],
      }));
      notify("已保存，工作台数据已更新");
      return record;
    } finally {
      pending.current.delete(key);
      void refresh();
    }
  };
  const remove = async (resource: Resource, id: string, version: number) => {
    const key = `${resource}/${id}`;
    if (pending.current.has(key)) throw new Error("正在处理这条记录，请稍候。");
    pending.current.add(key);
    revision.current++;
    try {
      await requestJSON(`/api/${resource}/${id}`, {
        method: "DELETE",
        headers: { "If-Match": String(version) },
      });
      changed();
      setData((old) => ({
        ...old,
        [resource]: old[resource].filter((r) => r.id !== id),
      }));
      notify("记录已删除");
    } finally {
      pending.current.delete(key);
      void refresh();
    }
  };
  return (
    <Context.Provider
      value={{
        data,
        loading,
        loaded,
        error,
        changeToken,
        refresh,
        save,
        remove,
        notify,
      }}
    >
      {children}
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : ""}`}
          role="status"
        >
          {toast.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          {toast.message}
        </div>
      )}
    </Context.Provider>
  );
}
export function useData() {
  const context = useContext(Context);
  if (!context) throw new Error("Missing provider");
  return context;
}
export function DataGate({ children }: { children: React.ReactNode }) {
  const { loading, loaded, error, refresh } = useData();
  if (loading && !loaded)
    return (
      <div className="loading">
        <LoaderCircle className="spin" size={24} />
        正在打开你的工作台…
      </div>
    );
  if (!loaded && error)
    return (
      <div className="empty">
        <AlertCircle />
        <p>{error}</p>
        <button
          className="button button-primary"
          onClick={() => void refresh()}
        >
          重新加载
        </button>
      </div>
    );
  return (
    <>
      {error && (
        <div className="sync-warning" role="status">
          <AlertCircle size={16} />
          <span>同步暂时失败，当前内容和输入已保留。</span>
          <button
            className="button button-outline button-sm"
            onClick={() => void refresh()}
          >
            重试同步
          </button>
        </div>
      )}
      {children}
    </>
  );
}
