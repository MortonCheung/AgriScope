const DAY_MS = 86_400_000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const beijingParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function parts(timestamp: number) {
  if (!Number.isFinite(timestamp)) throw new RangeError('无效时间');
  return Object.fromEntries(beijingParts.formatToParts(timestamp).map(part => [part.type, part.value]));
}

/** Browser time only. This value never supplies an observation or collection date. */
export function formatBeijingClock(timestamp: number): string {
  const value = parts(timestamp);
  return `${value.month}-${value.day} ${value.hour}:${value.minute}:${value.second}`;
}

export function beijingDay(timestamp: number): string {
  const value = parts(timestamp);
  return `${value.year}-${value.month}-${value.day}`;
}

export function isMarketDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function isMarketTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !isMarketDay(value.slice(0, 10)) || !Number.isFinite(Date.parse(value))) return false;
  const offset = value.match(/[+-](\d{2}):(\d{2})$/);
  return Number(value.slice(11, 13)) < 24 && Number(value.slice(14, 16)) < 60 && Number(value.slice(17, 19)) < 60
    && (!offset || (Number(offset[1]) < 24 && Number(offset[2]) < 60));
}

/** V2 may carry day precision. Never invent an hour for such evidence. */
export function formatMarketTimestamp(value: string | null | undefined): string | null {
  if (isMarketDay(value)) return value.slice(5);
  if (!isMarketTimestamp(value)) return null;
  return formatBeijingClock(Date.parse(value)).slice(0, -3);
}

export function latestMarketTimestamp(values: readonly string[]): string | null {
  return values.filter(value => isMarketDay(value) || isMarketTimestamp(value))
    .sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null;
}

export type MarketFreshness = { state: 'today' | 'recent' | 'historical' | 'old' | 'missing' | 'future'; label: string; ageDays: number | null };

/** Compare calendar days in Beijing, rather than elapsed 24-hour periods. */
export function marketFreshness(observationDate: string | null | undefined, now: number): MarketFreshness {
  if (!isMarketDay(observationDate)) return { state: 'missing', label: '暂无本地观测', ageDays: null };
  const today = Date.parse(`${beijingDay(now)}T00:00:00Z`);
  const ageDays = Math.round((today - Date.parse(`${observationDate}T00:00:00Z`)) / DAY_MS);
  if (ageDays < 0) return { state: 'future', label: '观测日期待核验', ageDays };
  if (ageDays === 0) return { state: 'today', label: '今日观测', ageDays };
  if (ageDays <= 2) return { state: 'recent', label: '近期观测', ageDays };
  if (ageDays <= 7) return { state: 'historical', label: '历史观测', ageDays };
  return { state: 'old', label: '数据较旧', ageDays };
}

/** Fixed-offset Beijing has no daylight saving. Update freshness at the next local midnight. */
export function millisecondsToBeijingMidnight(now: number): number {
  const local = now + BEIJING_OFFSET_MS;
  return DAY_MS - ((local % DAY_MS) + DAY_MS) % DAY_MS;
}
