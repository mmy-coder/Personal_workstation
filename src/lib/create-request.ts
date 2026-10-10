const pending = new Map<string, string>();
export async function createRequest(scope: string, body: unknown) {
  const encoded = new TextEncoder().encode(scope + JSON.stringify(body));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const key = `personal-os-request:${Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
  let token = pending.get(key);
  try {
    token ||= sessionStorage.getItem(key) || undefined;
  } catch {
    /* In-memory retries still work. */
  }
  token ||= crypto.randomUUID();
  pending.set(key, token);
  try {
    sessionStorage.setItem(key, token);
  } catch {
    /* Browser storage is optional. */
  }
  return {
    token,
    complete() {
      pending.delete(key);
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* No stored token. */
      }
    },
  };
}
