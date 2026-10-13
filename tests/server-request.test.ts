import test from "node:test";
import assert from "node:assert/strict";
import {
  assertWriteOrigin,
  readJSON,
  OperationError,
} from "../src/lib/server-request";

const request = (body: string, origin?: string) =>
  new Request("http://localhost:3000/api/items", {
    method: "POST",
    body,
    headers: { host: "localhost:3000", ...(origin ? { origin } : {}) },
  });
const status = (code: number) => (error: unknown) =>
  error instanceof OperationError && error.status === code;

test("写入来源校验兼容本地请求，拒绝异常协议、来源和端口", () => {
  assert.doesNotThrow(() => assertWriteOrigin(request("{}")));
  assert.doesNotThrow(() =>
    assertWriteOrigin(request("{}", "http://localhost:3000")),
  );
  for (const origin of [
    "null",
    "invalid",
    "http://other:3000",
    "http://localhost:3001",
    "ftp://localhost:3000",
  ])
    assert.throws(() => assertWriteOrigin(request("{}", origin)), status(403));
});

test("JSON 限制按实际字节执行，拒绝损坏或空正文", async () => {
  const body = JSON.stringify({ text: "中文" });
  const bytes = Buffer.byteLength(body);
  assert.deepEqual(await readJSON(request(body), bytes), { text: "中文" });
  await assert.rejects(readJSON(request(body), bytes - 1), status(413));
  await assert.rejects(readJSON(request("{"), 100), status(400));
  await assert.rejects(readJSON(request(""), 100), status(400));
});

test("分块 UTF-8 正文正确解码，超限流提前取消", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({ text: "中文" }));
  let index = 0;
  let cancelled = false;
  const streaming = () =>
    new Request("http://localhost/api", {
      method: "POST",
      duplex: "half",
      body: new ReadableStream({
        pull(controller) {
          if (index === bytes.length) controller.close();
          else controller.enqueue(bytes.slice(index, ++index));
        },
        cancel() {
          cancelled = true;
        },
      }),
    } as RequestInit);
  assert.deepEqual(await readJSON(streaming(), bytes.length), { text: "中文" });
  index = 0;
  await assert.rejects(readJSON(streaming(), 2), status(413));
  assert.equal(cancelled, true);
});
