"use client";
import { useEffect, useState } from "react";
import { requestJSON } from "@/lib/http";
import { useData } from "./provider";
export function useRecords<T>(url: string) {
  const { changeToken } = useData();
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{
    url: string;
    data?: T;
    error: string;
    loading: boolean;
  }>({ url, error: "", loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState((old) => ({
      url,
      data: old.url === url ? old.data : undefined,
      error: "",
      loading: true,
    }));
    void requestJSON<T>(url, { signal: controller.signal, cache: "no-store" })
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ url, data, error: "", loading: false });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState((old) => ({
            ...old,
            loading: false,
            error: error instanceof Error ? error.message : "读取失败",
          }));
      });
    return () => controller.abort();
  }, [url, changeToken, retry]);
  return {
    data: state.url === url ? state.data : undefined,
    error: state.url === url ? state.error : "",
    loading: state.url !== url || state.loading,
    retry: () => setRetry((v) => v + 1),
  };
}
