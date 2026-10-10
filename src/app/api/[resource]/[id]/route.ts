import { mutate, getRecord, isResource } from "@/lib/api";
type Context = { params: Promise<{ resource: string; id: string }> };
export async function PATCH(request: Request, ctx: Context) {
  const { resource, id } = await ctx.params;
  return mutate(request, resource, id);
}
export async function DELETE(request: Request, ctx: Context) {
  const { resource, id } = await ctx.params;
  return mutate(request, resource, id);
}

export async function GET(_: Request, ctx: Context) {
  const { resource, id } = await ctx.params;
  if (!isResource(resource))
    return Response.json({ error: "类型不存在" }, { status: 404 });
  try {
    const row = await getRecord(resource, id);
    return row
      ? Response.json(row, { headers: { "Cache-Control": "no-store" } })
      : Response.json({ error: "记录不存在" }, { status: 404 });
  } catch {
    return Response.json({ error: "读取失败，请稍后重试" }, { status: 500 });
  }
}
