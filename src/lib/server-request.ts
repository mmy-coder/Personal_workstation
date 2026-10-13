export class OperationError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function assertWriteOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let source: URL;
  try {
    source = new URL(origin);
  } catch {
    throw new OperationError("来源无效", 403);
  }
  if (
    !["http:", "https:"].includes(source.protocol) ||
    source.host !== request.headers.get("host")
  )
    throw new OperationError("不允许跨站写入", 403);
}

// Enforce the limit while reading, including requests without Content-Length.
export async function readJSON(
  request: Request,
  limit: number,
): Promise<unknown> {
  const tooLarge = () => new OperationError("内容过大", 413);
  if (Number(request.headers.get("content-length")) > limit) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw new OperationError("请求格式无效", 400);
  const decoder = new TextDecoder();
  let size = 0;
  let raw = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw tooLarge();
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new OperationError("请求格式无效", 400);
  }
}
