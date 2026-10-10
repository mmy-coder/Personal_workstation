"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
export function useCloseGuard(
  form: unknown,
  busy: boolean,
  onClose: () => void,
) {
  const initial = useRef(JSON.stringify(form));
  const dirty = JSON.stringify(form) !== initial.current;
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  return {
    close: () => {
      if (busy) return;
      if (dirty) setConfirming(true);
      else onClose();
    },
    prompt: confirming && (
      <div className="warning" role="alert">
        <span>有尚未保存的修改，要放弃吗？</span>
        <Button
          type="button"
          variant="outline"
          onClick={() => setConfirming(false)}
        >
          继续编辑
        </Button>
        <Button type="button" variant="destructive" onClick={onClose}>
          放弃修改
        </Button>
      </div>
    ),
  };
}
