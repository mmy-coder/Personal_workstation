import { z } from "zod";
import { once } from "@/lib/idempotency";
import {
  OperationError,
  assertWriteOrigin,
  readJSON,
} from "@/lib/server-request";
import { schemas } from "@/lib/validation";
import { nextRenewalDate } from "@/lib/renewal";
const inputSchema = schemas.payments
  .pick({ amountCents: true, paidOn: true, notes: true })
  .extend({
    version: z.number().int().nonnegative(),
    nextRenewal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  });
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    assertWriteOrigin(request);
    const token = request.headers.get("idempotency-key");
    if (!token) throw new OperationError("缺少请求标识，请重新打开表单", 428);
    const { id } = await ctx.params;
    const json = await readJSON(request, 100000);
    const input = inputSchema.parse(json);
    const result = await once(token, `renew:${id}`, input, async (tx) => {
      const sub = await tx.subscription.findUnique({ where: { id } });
      if (!sub) throw new OperationError("订阅不存在", 404);
      if (sub.version !== input.version)
        throw new OperationError(
          "订阅已在其他窗口更新，请重新打开后核对。",
          409,
        );
      if (sub.status !== "使用中")
        throw new OperationError("只有使用中的订阅可以确认续费。", 400);
      schemas.subscriptions.parse({ ...sub, nextRenewal: input.nextRenewal });
      if (input.nextRenewal <= sub.nextRenewal)
        throw new OperationError("下次续费日期必须晚于本期到期日。", 400);
      const expected = nextRenewalDate(
        sub.nextRenewal,
        sub.cycle as "月付" | "年付",
        sub.renewalAnchorDay,
      );
      const renewalAnchorDay =
        input.nextRenewal === expected
          ? sub.renewalAnchorDay || Number(sub.nextRenewal.slice(-2))
          : Number(input.nextRenewal.slice(-2));
      const subscription = await tx.subscription.update({
        where: { id, version: input.version },
        data: {
          nextRenewal: input.nextRenewal,
          renewalAnchorDay,
          version: { increment: 1 },
        },
      });
      const payment = await tx.subscriptionPayment.create({
        data: {
          subscriptionId: id,
          name: sub.name,
          category: sub.category,
          amountCents: input.amountCents,
          paidOn: input.paidOn,
          dueOn: sub.nextRenewal,
          notes: input.notes,
        },
      });
      return { subscription, payment };
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof OperationError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError)
      return Response.json(
        { error: error.issues.map((i) => i.message).join("；") },
        { status: 400 },
      );
    console.error(error);
    return Response.json(
      { error: "续费记录未完成，请重试；同一请求不会重复扣记。" },
      { status: 500 },
    );
  }
}
