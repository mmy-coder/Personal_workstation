import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
export class OperationError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => JSON.stringify(key) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export async function once<T>(
  token: string | null,
  scope: string,
  payload: unknown,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  if (token && !/^[a-zA-Z0-9_-]{8,128}$/.test(token))
    throw new OperationError("请求标识无效", 400);
  const fingerprint = createHash("sha256")
    .update(scope + canonical(payload))
    .digest("hex");
  const replay = (receipt: { fingerprint: string; response: string }) => {
    if (receipt.fingerprint !== fingerprint)
      throw new OperationError("请求标识已用于其他内容，请重新打开表单。", 409);
    return JSON.parse(receipt.response) as T;
  };
  try {
    return await db.$transaction(
      async (tx) => {
        if (token) {
          const previous = await tx.mutationReceipt.findUnique({
            where: { key: token },
          });
          if (previous) return replay(previous);
        }
        const result = await operation(tx);
        if (token)
          await tx.mutationReceipt.create({
            data: { key: token, fingerprint, response: JSON.stringify(result) },
          });
        return result;
      },
      { maxWait: 10000, timeout: 15000 },
    );
  } catch (error) {
    // A concurrent identical request may have committed while this transaction waited.
    if (
      token &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034", "P1008"].includes(error.code)
    ) {
      const previous = await db.mutationReceipt.findUnique({
        where: { key: token },
      });
      if (previous) return replay(previous);
    }
    throw error;
  }
}
