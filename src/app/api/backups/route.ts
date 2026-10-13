import { z } from "zod";
import { automaticBackupStore } from "@/lib/automatic-backup";
import {
  OperationError,
  assertWriteOrigin,
  readJSON,
} from "@/lib/server-request";
export const runtime = "nodejs";

function failure(error: unknown) {
  if (error instanceof OperationError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError)
    return Response.json(
      { error: "备份设置无效，请检查间隔和保留数量。" },
      { status: 400 },
    );
  console.error(error);
  return Response.json(
    { error: "备份操作失败，请检查磁盘空间和文件权限后重试。" },
    { status: 500 },
  );
}
export async function GET(request: Request) {
  try {
    const name = new URL(request.url).searchParams.get("file");
    const store = automaticBackupStore();
    if (name)
      return new Response(await store.download(name), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${name}"`,
          "Cache-Control": "no-store",
        },
      });
    return Response.json(await store.status(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    assertWriteOrigin(request);
    return Response.json(await automaticBackupStore().create(true));
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    assertWriteOrigin(request);
    return Response.json(
      await automaticBackupStore().configure(await readJSON(request, 2000)),
    );
  } catch (error) {
    return failure(error);
  }
}
