"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { dateKey } from "@/lib/dates";
import { usePathname } from "next/navigation";
export function usePageState<T extends string | number | boolean | Date>(
  key: string,
  fallback: T,
  parse: (raw: string) => T,
) {
  const currentPath = usePathname();
  const path = useRef(currentPath).current;
  const parser = useRef(parse);
  parser.current = parse;
  const initial = useRef(fallback);
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return fallback;
    let search = location.pathname === path ? location.search : "";
    if (!search)
      try {
        search = sessionStorage.getItem(`personal-os-view:${path}`) || "";
      } catch {
        /* URL still works. */
      }
    const raw = new URLSearchParams(search).get(key);
    return raw === null ? fallback : parse(raw);
  });
  useEffect(() => {
    if (currentPath !== path || location.pathname !== path) return;
    const url = new URL(location.href);
    const encoded = value instanceof Date ? dateKey(value) : String(value);
    const base =
      initial.current instanceof Date
        ? dateKey(initial.current)
        : String(initial.current);
    if (encoded === base) url.searchParams.delete(key);
    else url.searchParams.set(key, encoded);
    history.replaceState(
      history.state,
      "",
      url.pathname + url.search + url.hash,
    );
    try {
      sessionStorage.setItem(`personal-os-view:${path}`, url.search);
    } catch {
      /* Optional preference storage. */
    }
  }, [value, key, path, currentPath]);
  useEffect(() => {
    const pop = () => {
      if (location.pathname !== path) return;
      const raw = new URLSearchParams(location.search).get(key);
      setValue(raw === null ? initial.current : parser.current(raw));
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, [key, path]);
  return [value, setValue] as const;
}
export function choice<T extends string>(values: readonly T[], fallback: T) {
  return (raw: string): T =>
    values.includes(raw as T) ? (raw as T) : fallback;
}
export function useScrollMemory(
  ready = true,
  element?: RefObject<HTMLDivElement | null>,
  initial = 0,
) {
  const currentPath = usePathname();
  const path = useRef(currentPath).current;
  useLayoutEffect(() => {
    if (!ready || currentPath !== path) return;
    const key = `personal-os-scroll:${path}:${element ? "calendar" : "page"}`;
    let top = initial;
    try {
      const saved = sessionStorage.getItem(key);
      if (saved !== null && Number.isFinite(Number(saved))) top = Number(saved);
    } catch {
      /* Keep initial position. */
    }
    const target = element?.current;
    if (target) target.scrollTop = top;
    else window.scrollTo(0, top);
    const save = () => {
      try {
        sessionStorage.setItem(
          key,
          String(target ? target.scrollTop : window.scrollY),
        );
      } catch {
        /* Optional. */
      }
    };
    const surface = target || window;
    surface.addEventListener("scroll", save, { passive: true });
    return () => {
      save();
      surface.removeEventListener("scroll", save);
    };
  }, [ready, path, currentPath, element, initial]);
}
