"use client";
import { useEffect, useRef, useState } from "react";
import type { JournalEntry } from "@/lib/types";
import type { JournalDraft } from "@/lib/journal-draft";
import { requestJSON } from "@/lib/http";
import { useData } from "./provider";
export function useJournalEditor() {
  const { notify } = useData();
  const [editor, setEditor] = useState<{
    key: string;
    entry?: JournalEntry;
    initialDraft?: JournalDraft;
  } | null>(null);
  const [opening, setOpening] = useState(false);
  const controller = useRef<AbortController | null>(null),
    sequence = useRef(0);
  function cancel() {
    sequence.current++;
    controller.current?.abort();
    setOpening(false);
  }
  useEffect(
    () => () => {
      sequence.current++;
      controller.current?.abort();
    },
    [],
  );
  function create(initialDraft?: JournalDraft) {
    cancel();
    setEditor({ key: crypto.randomUUID(), initialDraft });
  }
  function close() {
    cancel();
    setEditor(null);
  }
  async function open(id: string) {
    cancel();
    const current = sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    setOpening(true);
    try {
      const entry = await requestJSON<JournalEntry>(`/api/journals/${id}`, {
        signal: abort.signal,
      });
      if (!abort.signal.aborted && sequence.current === current)
        setEditor({ key: crypto.randomUUID(), entry });
    } catch (error) {
      if (!abort.signal.aborted && sequence.current === current)
        notify((error as Error).message, true);
    } finally {
      if (sequence.current === current) setOpening(false);
    }
  }
  return { editor, opening, create, close, open };
}
