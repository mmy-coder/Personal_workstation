import { test } from "node:test";
import assert from "node:assert/strict";
import { chartValue } from "../src/lib/format";
import {
  encodeJournalDraft,
  parseJournalDraft,
} from "../src/lib/journal-draft";
import { workspaceURL } from "../src/lib/workspace-url";
import { addDays, monthRange, startOfDay, startOfWeek } from "../src/lib/dates";

test("图表金额保留到分，数量与小时使用对应精度", () => {
  assert.equal(chartValue(19.99, "元"), "19.99");
  assert.equal(chartValue(12000.01, "元"), "12,000.01");
  assert.equal(chartValue(1999 / 1200, "元"), "1.67");
  assert.equal(chartValue(12, "件"), "12");
  assert.equal(chartValue(1.5, "小时"), "1.5");
});
test("草稿记录基准版本，兼容旧草稿并拒绝损坏内容", () => {
  const form = {
    title: "思考",
    content: "留下文字",
    tags: "成长",
    pinned: false,
    favorite: true,
  };
  const draft = parseJournalDraft(encodeJournalDraft(form, 3));
  assert.deepEqual(draft?.form, form);
  assert.equal(draft?.basedOnVersion, 3);
  assert.equal(parseJournalDraft(JSON.stringify(form))?.basedOnVersion, null);
  assert.equal(parseJournalDraft("{broken"), null);
  assert.equal(parseJournalDraft('{"format":1,"form":{}}'), null);
});
test("总览查询覆盖本地本周、本月与最近七天，包括跨月周", () => {
  for (const now of [
    new Date(2026, 2, 1),
    new Date(2026, 11, 31),
    new Date(2026, 9, 5),
  ]) {
    const query = new URL(workspaceURL(now), "http://localhost").searchParams;
    const from = +new Date(query.get("from")!),
      to = +new Date(query.get("to")!);
    const [month, next] = monthRange(now);
    assert.ok(
      from <= +month &&
        from <= +startOfWeek(now) &&
        from <= +addDays(startOfDay(now), -6),
    );
    assert.ok(to >= +next && to >= +addDays(startOfWeek(now), 7));
    assert.ok(to - from <= 38 * 86400000);
  }
});
