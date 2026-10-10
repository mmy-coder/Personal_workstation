export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function requestJSON<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new RequestError(
      "连接失败，请确认本地服务正在运行后重试。你的输入仍保留。",
      0,
    );
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new RequestError("服务器响应异常，请稍后重试。", response.status);
  }
  if (!response.ok)
    throw new RequestError(
      result.error || "操作失败，请稍后重试。",
      response.status,
    );
  return result as T;
}
