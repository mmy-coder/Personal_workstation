import { allData } from "@/lib/api";
import { workspaceData, queryError } from "@/lib/queries";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(
      params.get("view") === "workspace"
        ? await workspaceData(params)
        : await allData(),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return queryError(error);
  }
}
