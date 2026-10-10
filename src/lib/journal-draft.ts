export type JournalDraft = {
  title: string;
  content: string;
  tags: string;
  pinned: boolean;
  favorite: boolean;
};
export type SavedJournalDraft = {
  format: 1;
  basedOnVersion: number | null;
  savedAt: string;
  form: JournalDraft;
};
export function parseJournalDraft(
  raw: string | null,
): SavedJournalDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw),
      form = value.format === 1 ? value.form : value;
    if (
      !form ||
      typeof form.title !== "string" ||
      typeof form.content !== "string" ||
      typeof form.tags !== "string" ||
      typeof form.pinned !== "boolean" ||
      typeof form.favorite !== "boolean"
    )
      return null;
    return {
      format: 1,
      basedOnVersion:
        value.format === 1 && Number.isInteger(value.basedOnVersion)
          ? value.basedOnVersion
          : null,
      savedAt: typeof value.savedAt === "string" ? value.savedAt : "",
      form,
    };
  } catch {
    return null;
  }
}
export function encodeJournalDraft(
  form: JournalDraft,
  basedOnVersion: number | null,
) {
  return JSON.stringify({
    format: 1,
    basedOnVersion,
    savedAt: new Date().toISOString(),
    form,
  } satisfies SavedJournalDraft);
}
