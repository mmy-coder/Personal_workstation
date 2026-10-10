import { parseJournalDraft, type SavedJournalDraft } from "./journal-draft";
// A fresh owner on each page load also isolates browser-duplicated tabs.
let owner: string | undefined;
const memory = new Map<string, string>();
export const draftPrefix = "personal-os-draft-v2:";
export type RecoveryDraft = { key: string; draft: SavedJournalDraft };
export type StoredDraft = RecoveryDraft & {
  record: string;
  raw: string;
  active: boolean;
};
const leasePrefix = "personal-os-draft-lease:";
export function keepDraftActive(key: string) {
  const touch = () => {
    try {
      localStorage.setItem(leasePrefix + key, String(Date.now()));
    } catch {
      /* Draft editor reports storage problems. */
    }
  };
  touch();
  const timer = setInterval(touch, 30000);
  return () => {
    clearInterval(timer);
    try {
      localStorage.removeItem(leasePrefix + key);
    } catch {
      /* Optional lease. */
    }
  };
}
function isActive(key: string) {
  return (
    Date.now() - Number(localStorage.getItem(leasePrefix + key) || 0) < 120000
  );
}
export function allDrafts(): StoredDraft[] {
  const result: StoredDraft[] = [];
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith("personal-os-draft-")) continue;
    const raw = localStorage.getItem(key)!;
    const draft = parseJournalDraft(raw);
    if (!draft) continue;
    let record: string;
    try {
      record = key.startsWith(draftPrefix)
        ? decodeURIComponent(key.slice(draftPrefix.length).split(":")[0])
        : key.slice("personal-os-draft-".length);
    } catch {
      continue;
    }
    result.push({ key, raw, record, draft, active: isActive(key) });
  }
  return result.sort((a, b) => b.draft.savedAt.localeCompare(a.draft.savedAt));
}
export function duplicateDrafts(rows: StoredDraft[]) {
  const groups = new Map<string, StoredDraft[]>();
  for (const row of rows) {
    const signature = JSON.stringify([
      row.record,
      row.draft.basedOnVersion,
      row.draft.form,
    ]);
    groups.set(signature, [...(groups.get(signature) || []), row]);
  }
  return [...groups.values()].flatMap((group) => {
    const sorted = [...group].sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        b.draft.savedAt.localeCompare(a.draft.savedAt),
    );
    return sorted.slice(1).filter((row) => !row.active);
  });
}
export function removeDraftSnapshots(rows: StoredDraft[]) {
  let removed = 0;
  for (const row of rows)
    if (!isActive(row.key) && localStorage.getItem(row.key) === row.raw) {
      localStorage.removeItem(row.key);
      removed++;
    }
  return removed;
}
function prefix(record: string) {
  return `${draftPrefix}${encodeURIComponent(record)}:`;
}
export function listDrafts(record: string): RecoveryDraft[] {
  const result: RecoveryDraft[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (
      !key.startsWith(prefix(record)) &&
      key !== `personal-os-draft-${record}`
    )
      continue;
    const draft = parseJournalDraft(localStorage.getItem(key));
    if (draft) result.push({ key, draft });
  }
  return result.sort((a, b) => b.draft.savedAt.localeCompare(a.draft.savedAt));
}
export function openDraft(record: string, fresh = false) {
  owner ||= crypto.randomUUID();
  const pointer = `personal-os-draft-pointer:${record}`;
  let previous = memory.get(record);
  try {
    previous ||= sessionStorage.getItem(pointer) || undefined;
  } catch {
    /* Memory still isolates this tab. */
  }
  if (fresh) previous = undefined;
  const key = previous?.startsWith(`${prefix(record)}${owner}:`)
    ? previous
    : `${prefix(record)}${owner}:${crypto.randomUUID()}`;
  memory.set(record, key);
  try {
    sessionStorage.setItem(pointer, key);
  } catch {
    /* Local recovery remains available. */
  }
  let restored: SavedJournalDraft | null = null;
  try {
    if (previous) restored = parseJournalDraft(localStorage.getItem(previous));
  } catch {
    /* Editor reports unavailable storage on write. */
  }
  // Never delete the source: it may belong to a duplicated tab still editing.
  return { key, restored };
}
