import path from "node:path";
import { allData } from "./api";
import { BackupStore } from "./backup-store";
import { OperationError } from "./server-request";

export function automaticBackupStore() {
  const url = process.env.DATABASE_URL || "file:./personal.db";
  if (!url.startsWith("file:")) throw new Error("自动备份目前仅支持 SQLite");
  const database = path.resolve(
    process.cwd(),
    "prisma",
    url.slice(5).split("?")[0],
  );
  return new BackupStore(
    path.join(
      path.dirname(database),
      "backups",
      path.basename(database),
      "automatic",
    ),
    allData,
  );
}

const runtime = globalThis as unknown as {
  automaticBackupTimer?: ReturnType<typeof setInterval>;
};
export function startAutomaticBackups() {
  if (runtime.automaticBackupTimer) return;
  const tick = async () => {
    try {
      await automaticBackupStore().create();
    } catch (error) {
      if (!(error instanceof OperationError && error.status === 409))
        console.error("Automatic backup failed", error);
    }
  };
  // Unref prevents the scheduler from keeping a stopped server alive.
  setTimeout(() => void tick(), 5000).unref();
  runtime.automaticBackupTimer = setInterval(() => void tick(), 60000);
  runtime.automaticBackupTimer.unref();
}
