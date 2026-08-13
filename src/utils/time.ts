/**
 * 日期工具（架构文档 §7.2 共享知识约定）
 * 日历日期一律 YYYY-MM-DD（本地时区，禁止用 toISOString() 取日期——UTC 会跨日）；
 * 时间戳（计时、updatedAt）用 ISO 8601 UTC。
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 把 Date 格式化为本地时区 YYYY-MM-DD。 */
export function formatDateLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 今日日期（本地时区）YYYY-MM-DD。 */
export function todayISO(): string {
  return formatDateLocal(new Date());
}

/** 昨日日期（本地时区）YYYY-MM-DD。 */
export function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDateLocal(d);
}

/** 明日日期（本地时区）YYYY-MM-DD。 */
export function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatDateLocal(d);
}

/** 当前 ISO 8601 UTC 时间戳。 */
export function nowISO(): string {
  return new Date().toISOString();
}
