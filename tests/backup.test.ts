import { test } from "node:test";
import assert from "node:assert/strict";
import { backupSchema } from "../src/lib/backup";
const now = "2026-10-10T00:00:00.000Z";
const journal = {
  id: "note",
  version: 0,
  createdAt: now,
  updatedAt: now,
  title: "",
  content: "备份正文",
  tags: ["成长"],
  favorite: false,
  pinned: false,
};
const backup = {
  version: 1,
  exportedAt: now,
  events: [],
  items: [],
  subscriptions: [],
  journals: [journal],
};
test("备份校验支持完整导出并拒绝重复 ID、非法字段与未知格式", () => {
  assert.ok(backupSchema.safeParse(backup).success);
  assert.equal(
    backupSchema.safeParse({ ...backup, version: 2 }).success,
    false,
  );
  assert.equal(
    backupSchema.safeParse({ ...backup, journals: [journal, journal] }).success,
    false,
  );
  assert.equal(
    backupSchema.safeParse({
      ...backup,
      journals: [{ ...journal, content: "" }],
    }).success,
    false,
  );
  assert.equal(
    backupSchema.safeParse({
      ...backup,
      journals: [{ ...journal, createdAt: "invalid" }],
    }).success,
    false,
  );
});
