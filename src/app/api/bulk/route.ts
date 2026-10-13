import { z } from "zod";
import { bulkSchema } from "@/lib/bulk";
import { once } from "@/lib/idempotency";
import {
  assertWriteOrigin,
  OperationError,
  readJSON,
} from "@/lib/server-request";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertWriteOrigin(request);
    const input = bulkSchema.parse(await readJSON(request, 50000));
    const token = request.headers.get("idempotency-key");
    if (!token)
      throw new OperationError("缺少请求标识，请重新打开批量管理。", 428);
    const result = await once(token, "bulk", input, async (tx) => {
      const where = { OR: input.records };
      const operation = input.operation;
      const common = {
        version: { increment: 1 },
        ...(operation.action === "category"
          ? { category: operation.value }
          : {}),
      };
      const assetData = {
        ...common,
        ...(operation.action === "status" ? { status: operation.value } : {}),
      };
      const eventData = {
        ...common,
        ...(operation.action === "complete"
          ? { completed: operation.value }
          : {}),
      };
      const result =
        input.resource === "items"
          ? operation.action === "delete"
            ? await tx.item.deleteMany({ where })
            : await tx.item.updateMany({ where, data: assetData })
          : input.resource === "subscriptions"
            ? operation.action === "delete"
              ? await tx.subscription.deleteMany({ where })
              : await tx.subscription.updateMany({ where, data: assetData })
            : operation.action === "delete"
              ? await tx.calendarEvent.deleteMany({ where })
              : await tx.calendarEvent.updateMany({ where, data: eventData });
      if (result.count !== input.records.length)
        throw new OperationError(
          "有记录已被修改或删除，本次整批操作已取消。请关闭批量管理，刷新后重新选择。",
          409,
        );
      return { count: result.count };
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof OperationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError)
      return Response.json(
        { error: error.issues[0]?.message || "批量操作参数无效" },
        { status: 400 },
      );
    console.error("Bulk operation failed", error);
    return Response.json(
      { error: "批量操作失败，所有修改已回滚，请稍后重试。" },
      { status: 500 },
    );
  }
}
