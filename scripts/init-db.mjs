import { mkdirSync, closeSync, openSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
// Prisma's SQLite engine on some platforms expects the file to exist first.
// Append mode creates a missing file and never truncates an existing database.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("请先复制 .env.example 为 .env 并设置 DATABASE_URL");
if (url.startsWith("file:")) {
  const path = resolve("prisma", url.slice(5).split("?")[0]);
  mkdirSync(dirname(path), { recursive: true });
  closeSync(openSync(path, "a"));
}
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { stdio: "inherit", env: process.env },
);
process.exit(result.status ?? 1);
