import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { backupLimit, backupSchema } from "./backup";
import {
  backupSettingsSchema,
  defaultBackupSettings,
  type BackupStatus,
} from "./backup-settings";
import { OperationError } from "./server-request";

const filenamePattern =
  /^auto-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9-]{36}\.json$/;
const isMissing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";
const runtime = globalThis as unknown as {
  personalOSBackupLocks?: Set<string>;
};
const activeLocks = (runtime.personalOSBackupLocks ||= new Set<string>());

export class BackupStore {
  constructor(
    private directory: string,
    private snapshot: () => Promise<unknown>,
    private now = () => new Date(),
  ) {}

  private async atomic(name: string, value: unknown) {
    const temporary = path.join(this.directory, `${name}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(value, null, 2), {
        flag: "wx",
        mode: 0o600,
      });
      await rename(temporary, path.join(this.directory, name));
    } finally {
      await unlink(temporary).catch((error) => {
        if (!isMissing(error)) throw error;
      });
    }
  }

  private async locked<T>(operation: () => Promise<T>): Promise<T> {
    const key = path.resolve(this.directory);
    if (activeLocks.has(key))
      throw new OperationError("备份任务正在进行，请稍后重试。", 409);
    activeLocks.add(key);
    try {
      return await this.fileLocked(operation);
    } finally {
      activeLocks.delete(key);
    }
  }

  private async fileLocked<T>(operation: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true });
    const lockPath = path.join(this.directory, ".auto-backup.lock");
    let lock;
    try {
      lock = await open(lockPath, "wx");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // Recover a lock left by a terminated server; never interrupt a live owner.
      let abandoned = false;
      try {
        const owner = JSON.parse(await readFile(lockPath, "utf8"));
        if (Number.isSafeInteger(owner.pid) && owner.pid > 0) {
          try {
            process.kill(owner.pid, 0);
          } catch (check) {
            abandoned = (check as NodeJS.ErrnoException).code === "ESRCH";
          }
        }
      } catch (check) {
        if (isMissing(check)) return this.fileLocked(operation);
        // An interrupted creation can leave an empty lock.
        if (check instanceof SyntaxError)
          abandoned = Date.now() - (await stat(lockPath)).mtimeMs > 600000;
        else throw check;
      }
      if (!abandoned)
        throw new OperationError("备份任务正在进行，请稍后重试。", 409);
      await unlink(lockPath).catch((error) => {
        if (!isMissing(error)) throw error;
      });
      return this.fileLocked(operation);
    }
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid }));
      return await operation();
    } finally {
      await lock.close();
      await unlink(lockPath);
    }
  }

  async status(): Promise<BackupStatus> {
    let settings = defaultBackupSettings;
    try {
      settings = backupSettingsSchema.parse(
        JSON.parse(
          await readFile(path.join(this.directory, "settings.json"), "utf8"),
        ),
      );
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const entries = await readdir(this.directory, {
      withFileTypes: true,
    }).catch((error) => {
      if (isMissing(error)) return [];
      throw error;
    });
    const files = (
      await Promise.all(
        entries
          .filter((entry) => entry.isFile() && filenamePattern.test(entry.name))
          .map(async (entry) => {
            try {
              const info = await stat(path.join(this.directory, entry.name));
              const stamp = entry.name
                .slice(5, 29)
                .replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z");
              return { name: entry.name, createdAt: stamp, bytes: info.size };
            } catch (error) {
              if (isMissing(error)) return null;
              throw error;
            }
          }),
      )
    )
      .filter((file) => file !== null)
      .sort((a, b) => b.name.localeCompare(a.name));
    let lastError = "";
    try {
      lastError =
        JSON.parse(
          await readFile(path.join(this.directory, "status.json"), "utf8"),
        ).lastError || "";
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    return { settings, files, lastError };
  }

  async configure(input: unknown) {
    const settings = backupSettingsSchema.parse(input);
    return this.locked(async () => {
      await this.atomic("settings.json", settings);
      return this.status();
    });
  }

  async create(force = false) {
    return this.locked(async () => {
      const current = await this.status();
      const now = this.now();
      const last = current.files[0];
      if (
        !force &&
        (!current.settings.enabled ||
          (last &&
            +now - +new Date(last.createdAt) <
              current.settings.intervalHours * 3600000))
      )
        return current;
      try {
        const data = JSON.parse(
          JSON.stringify({
            version: 1,
            exportedAt: now.toISOString(),
            ...((await this.snapshot()) as object),
          }),
        );
        if (!backupSchema.safeParse(data).success)
          throw new Error(
            "数据不符合备份格式或超过记录限制，请检查数据后重试。",
          );
        // Leave room for the restore request wrapper.
        if (
          Buffer.byteLength(JSON.stringify(data, null, 2)) >
          backupLimit - 100
        )
          throw new Error("备份超过 20 MB，请改用完整数据库文件备份。");
        const name = `auto-${now.toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.json`;
        await this.atomic(name, data);
        // Never prune restore safety copies or files not created by this service.
        const files = (await this.status()).files;
        for (const file of files
          .filter((file) => file.name !== name)
          .slice(current.settings.retain - 1))
          await unlink(path.join(this.directory, file.name)).catch((error) => {
            if (!isMissing(error)) throw error;
          });
        await this.atomic("status.json", { lastError: "" });
        return this.status();
      } catch (error) {
        await this.atomic("status.json", {
          lastError:
            "最近一次备份未完成，请检查磁盘空间、文件权限或记录是否超出备份限制。",
        });
        throw error;
      }
    });
  }

  async download(name: string) {
    if (!filenamePattern.test(name))
      throw new OperationError("备份文件不存在", 404);
    const files = (await this.status()).files;
    if (!files.some((file) => file.name === name))
      throw new OperationError("备份文件不存在", 404);
    try {
      return await readFile(path.join(this.directory, name), "utf8");
    } catch (error) {
      if (isMissing(error))
        throw new OperationError("备份已轮换，请刷新列表", 404);
      throw error;
    }
  }
}
