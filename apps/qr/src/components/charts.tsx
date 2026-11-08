type Point = { key: string; scans: number; uniques: number };

const niceMax = (v: number) => { if (v <= 4) return 4; const p = 10 ** Math.floor(Math.log10(v)); return Math.ceil(v / p) * p; };
const short = (k: string, hourly: boolean) => hourly ? `${Number(k.slice(11))}:00` : new Date(`${k}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const longLabel = (k: string, hourly: boolean) => hourly ? `${k.slice(0, 10)} ${k.slice(11)}:00` : k;

/** Scans (solid) and unique clicks (dashed) over time. Plain SVG, so it renders on the server and never blocks on JS. */
export function LineChart({ points, hourly }: { points: Point[]; hourly: boolean }) {
  const W = 720, H = 240, L = 40, R = 12, T = 12, B = 28;
  const max = niceMax(Math.max(1, ...points.map((p) => p.scans)));
  const x = (i: number) => L + (points.length <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const line = (f: (p: Point) => number) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(f(p)).toFixed(1)}`).join("");
  const ticks = [0, 1, 2, 3, 4].map((i) => (max * i) / 4);
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  const total = points.reduce((a, p) => a + p.scans, 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Scans over time: ${total} scans across ${points.length} ${hourly ? "hours" : "days"}`} style={{ width: "100%", height: "auto" }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--mute)">{Math.round(t)}</text>
        </g>
      ))}
      {points.map((p, i) => i % labelEvery === 0 && (
        <text key={p.key} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--mute)">{short(p.key, hourly)}</text>
      ))}
      <path d={line((p) => p.uniques)} fill="none" stroke="var(--series2)" strokeWidth="2" strokeDasharray="5 4" />
      <path d={line((p) => p.scans)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
      {points.map((p, i) => (
        <circle key={p.key} cx={x(i)} cy={y(p.scans)} r={points.length > 45 ? 2 : 3.5} fill="var(--accent)">
          <title>{`${longLabel(p.key, hourly)}: ${p.scans} scans, ${p.uniques} unique`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function Legend() {
  return (
    <p className="mute" style={{ margin: "4px 0 0" }}>
      <span style={{ color: "var(--accent)" }}>━</span> Scans &nbsp; <span style={{ color: "var(--series2)" }}>╍</span> Unique clicks
    </p>
  );
}

export function BarList({ items, empty = "No scans in this range." }: { items: { label: string; n: number }[]; empty?: string }) {
  if (items.length === 0 || items.every((i) => i.n === 0)) return <p className="mute">{empty}</p>;
  const max = Math.max(...items.map((i) => i.n));
  const total = items.reduce((a, i) => a + i.n, 0);
  return (
    <ul className="bars">
      {items.map((i) => (
        <li key={i.label} title={`${i.label}: ${i.n} (${Math.round((i.n / total) * 100)}%)`}>
          <span className="bl">{i.label}</span>
          <span className="bt"><span className="bf" style={{ width: `${Math.max(2, (i.n / max) * 100)}%` }} /></span>
          <span className="bn">{i.n}</span>
        </li>
      ))}
    </ul>
  );
}

export function StatBox({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="card stat">
      <div className="mute">{label}</div>
      <div className="big">{typeof value === "number" ? value.toLocaleString("en-US") : value}</div>
      {sub && <div className="mute">{sub}</div>}
    </div>
  );
}
