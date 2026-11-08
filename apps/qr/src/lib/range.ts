/** Date ranges in the client's time zone. `from` is inclusive and `to` exclusive, both real UTC instants. */
export type Range = {
  key: string; label: string; from: Date; to: Date; tz: string;
  hourly: boolean; fromStr: string; toStr: string; // fromStr/toStr: inclusive local dates, YYYY-MM-DD
};
export const PRESETS = [
  { key: "7d", label: "Last 7 days" }, { key: "30d", label: "Last 30 days" }, { key: "90d", label: "Last 90 days" },
  { key: "this-month", label: "This month" }, { key: "last-month", label: "Last month" },
] as const;

type YMD = { y: number; m: number; d: number };

function zoneParts(date: Date, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(date).map((x) => [x.type, Number(x.value)]),
  );
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}
const offsetMs = (date: Date, tz: string) => {
  const p = zoneParts(date, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(date.getTime() / 1000) * 1000;
};

/** Midnight at the start of a local calendar day, as a UTC instant (handles DST). */
export function startOfLocalDay({ y, m, d }: YMD, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(new Date(guess), tz);
  const again = guess - offsetMs(new Date(t), tz);
  if (again !== t) t = again;
  return new Date(t);
}
export const localDay = (date: Date, tz: string): YMD => { const p = zoneParts(date, tz); return { y: p.y, m: p.m, d: p.d }; };
const addDays = ({ y, m, d }: YMD, n: number): YMD => { const x = new Date(Date.UTC(y, m - 1, d + n)); return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() }; };
const fmt = ({ y, m, d }: YMD) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
function parseYmd(s: string | undefined): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const v = { y: +m[1], m: +m[2], d: +m[3] };
  const check = new Date(Date.UTC(v.y, v.m - 1, v.d));
  return check.getUTCFullYear() === v.y && check.getUTCMonth() === v.m - 1 && check.getUTCDate() === v.d ? v : null;
}
const MAX_DAYS = 366;

export function parseRange(sp: { range?: string; from?: string; to?: string }, tz: string, now = new Date()): Range {
  const today = localDay(now, tz);
  let first: YMD, last: YMD, key = sp.range ?? "30d", label = "";
  const from = parseYmd(sp.from), to = parseYmd(sp.to);
  if (from && to) {
    [first, last] = fmt(from) <= fmt(to) ? [from, to] : [to, from];
    const span = (Date.UTC(last.y, last.m - 1, last.d) - Date.UTC(first.y, first.m - 1, first.d)) / 86_400_000 + 1;
    if (span > MAX_DAYS) first = addDays(last, -(MAX_DAYS - 1));
    key = "custom"; label = `${fmt(first)} to ${fmt(last)}`;
  } else if (key === "this-month") {
    first = { y: today.y, m: today.m, d: 1 }; last = today; label = "This month";
  } else if (key === "last-month") {
    const prev = addDays({ y: today.y, m: today.m, d: 1 }, -1);
    first = { y: prev.y, m: prev.m, d: 1 }; last = prev; label = "Last month";
  } else {
    const n = key === "7d" ? 7 : key === "90d" ? 90 : 30;
    key = `${n}d`; first = addDays(today, -(n - 1)); last = today; label = `Last ${n} days`;
  }
  const f = startOfLocalDay(first, tz), t = startOfLocalDay(addDays(last, 1), tz);
  return { key, label, from: f, to: t, tz, hourly: t.getTime() - f.getTime() <= 49 * 3_600_000, fromStr: fmt(first), toStr: fmt(last) };
}

/** Every bucket label in the range, so charts show zero days instead of skipping them. */
export function bucketKeys(r: Range): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (let t = r.from.getTime(); t < r.to.getTime(); t += 3_600_000) {
    const p = zoneParts(new Date(t), r.tz);
    const k = r.hourly ? `${fmt(p)} ${String(p.h).padStart(2, "0")}` : fmt(p);
    if (!seen.has(k)) { seen.add(k); keys.push(k); }
  }
  return keys;
}
