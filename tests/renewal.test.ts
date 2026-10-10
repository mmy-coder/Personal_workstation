import { test } from "node:test";
import assert from "node:assert/strict";
import { nextRenewalDate, paymentTrend } from "../src/lib/renewal";
test("续费按周期推进，短月保留原锚点，支持闰日年付", () => {
  assert.equal(nextRenewalDate("2026-01-31", "月付"), "2026-02-28");
  assert.equal(nextRenewalDate("2026-02-28", "月付", 31), "2026-03-31");
  assert.equal(nextRenewalDate("2024-01-31", "月付"), "2024-02-29");
  assert.equal(nextRenewalDate("2024-02-29", "年付"), "2025-02-28");
  assert.equal(nextRenewalDate("2027-02-28", "年付", 29), "2028-02-29");
});
test("付款趋势仅汇总已记录月份，并以整数分累加", () => {
  assert.deepEqual(
    paymentTrend([
      { paidOn: "2026-10-01", amountCents: 1999 },
      { paidOn: "2026-10-02", amountCents: 1 },
      { paidOn: "2026-08-01", amountCents: 99 },
    ]),
    [
      { name: "2026-08", 实际付款: 0.99 },
      { name: "2026-10", 实际付款: 20 },
    ],
  );
  assert.deepEqual(paymentTrend([]), []);
});
