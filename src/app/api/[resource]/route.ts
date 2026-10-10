import { isResource, mutate } from "@/lib/api";
import { listRecords, queryError } from "@/lib/queries";
type Context = { params: Promise<{ resource: string }> };
export async function GET(request: Request, ctx: Context) {
  const { resource } = await ctx.params;
  if (!isResource(resource))
    return Response.json({ error: "类型不存在" }, { status: 404 });
  try {
    return Response.json(
      await listRecords(resource, new URL(request.url).searchParams),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return queryError(error);
  }
}
export async function POST(request: Request, ctx: Context) {
  return mutate(request, (await ctx.params).resource);
}
