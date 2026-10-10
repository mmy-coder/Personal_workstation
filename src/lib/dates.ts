export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function localDate(key: string) {
  return new Date(`${key}T00:00:00`);
}
export function addDays(date: Date, count: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + count);
  return d;
}
export function startOfDay(date: Date) {
  return localDate(dateKey(date));
}
export function startOfWeek(date: Date) {
  const d = startOfDay(date);
  return addDays(d, -((d.getDay() + 6) % 7));
}
export function monthRange(date: Date) {
  return [
    new Date(date.getFullYear(), date.getMonth(), 1),
    new Date(date.getFullYear(), date.getMonth() + 1, 1),
  ] as const;
}
export function inputDateTime(date: Date) {
  return `${dateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function timeLabel(value: string | Date) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
export function shortDate(value: string | Date) {
  return new Date(value).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
  });
}
export function money(cents: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
export function hours(value: number) {
  return Number(value.toFixed(1)).toLocaleString("zh-CN");
}
