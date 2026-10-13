import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { BackupStore } from "../src/lib/backup-store";
import { backupSchema } from "../src/lib/backup";

const empty = () =>
  Promise.resolve({
    events: [],
    items: [],
    subscriptions: [],
    journals: [],
    payments: [],
  });
async function fixture(t: TestContext) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "personal-os-backup-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("automatic backup respects interval, disabled setting and manual override", async (t) => {
  const directory = await fixture(t);
  let time = Date.parse("2026-10-13T10:00:00Z");
  const store = new BackupStore(directory, empty, () => new Date(time));
  const first = await store.create();
  assert.equal(first.files.length, 1);
  assert.equal(first.files[0].createdAt, new Date(time).toISOString());
  assert.equal((await store.create()).files.length, 1);
  time += 86400000;
  assert.equal((await store.create()).files.length, 2);
  await store.configure({ enabled: false, intervalHours: 24, retain: 7 });
  time += 86400000;
  assert.equal((await store.create()).files.length, 2);
  const manual = await store.create(true);
  assert.equal(manual.files.length, 3);
  assert.ok(
    backupSchema.safeParse(
      JSON.parse(await store.download(manual.files[0].name)),
    ).success,
  );
});

test("rotation only removes owned backups after a valid new snapshot is saved", async (t) => {
  const directory = await fixture(t);
  let time = Date.now();
  let fail = false;
  const store = new BackupStore(
    directory,
    () => (fail ? Promise.reject(new Error("disk source failed")) : empty()),
    () => new Date(time++),
  );
  await store.configure({ enabled: true, intervalHours: 1, retain: 2 });
  await writeFile(
    path.join(directory, "before-restore-safety.json"),
    "preserve",
  );
  for (let i = 0; i < 3; i++) await store.create(true);
  const before = (await store.status()).files;
  assert.equal(before.length, 2);
  fail = true;
  await assert.rejects(store.create(true), /disk source failed/);
  const after = await store.status();
  assert.deepEqual(after.files, before);
  assert.ok(after.lastError);
  assert.equal(
    await readFile(path.join(directory, "before-restore-safety.json"), "utf8"),
    "preserve",
  );
});

test("backup validates settings and rejects paths outside its owned files", async (t) => {
  const directory = await fixture(t);
  const store = new BackupStore(directory, empty);
  await assert.rejects(
    store.configure({ enabled: true, intervalHours: 0, retain: 0 }),
  );
  await assert.rejects(store.download("../../personal.db"), /不存在/);
  await assert.rejects(store.download("settings.json"), /不存在/);
  const invalid = new BackupStore(directory, async () => ({ bad: true }));
  await assert.rejects(invalid.create(true), /备份格式/);
  assert.equal((await store.status()).files.length, 0);
});

test("backup rejects concurrent writers and recovers an exited process lock", async (t) => {
  const directory = await fixture(t);
  let release!: () => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const store = new BackupStore(directory, async () => {
    started();
    await blocked;
    return empty();
  });
  const task = store.create(true);
  await ready;
  await assert.rejects(
    new BackupStore(directory, empty).create(true),
    /正在进行/,
  );
  release();
  await task;
  const exited = spawnSync(process.execPath, ["-e", "process.exit(0)"], {
    windowsHide: true,
  });
  assert.equal(exited.status, 0);
  await writeFile(
    path.join(directory, ".auto-backup.lock"),
    JSON.stringify({ pid: exited.pid }),
  );
  assert.equal(
    (await new BackupStore(directory, empty).create(true)).files.length,
    2,
  );
});
