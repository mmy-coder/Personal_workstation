/** Values are in the chart's displayed units (yuan, hours or item counts). */
export function chartValue(value: number, unit: string) {
  const digits = unit === "元" ? 2 : unit === "件" ? 0 : 1;
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: unit === "元" ? 2 : 0,
    maximumFractionDigits: digits,
  }).format(value);
}
