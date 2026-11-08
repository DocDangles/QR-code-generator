import { PRESETS, type Range } from "@/lib/range";

/** Server-rendered filter: presets are links, custom dates are a plain GET form. The range lives in the URL so views can be shared. */
export function RangeFilter({ range, base, keep = {} }: { range: Range; base: string; keep?: Record<string, string | undefined> }) {
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...keep, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row">
        {PRESETS.map((p) => (
          <a key={p.key} className="chip" role="link" aria-current={range.key === p.key ? "true" : undefined} aria-pressed={range.key === p.key} href={qs({ range: p.key })} style={{ textDecoration: "none" }}>{p.label}</a>
        ))}
      </div>
      <form method="get" action={base} className="row" style={{ marginTop: 10 }}>
        {Object.entries(keep).map(([k, v]) => v ? <input key={k} type="hidden" name={k} value={v} /> : null)}
        <label style={{ margin: 0 }}>From<input type="date" name="from" defaultValue={range.fromStr} style={{ width: "auto", marginLeft: 6 }} /></label>
        <label style={{ margin: 0 }}>To<input type="date" name="to" defaultValue={range.toStr} style={{ width: "auto", marginLeft: 6 }} /></label>
        <button className="btn" type="submit">Apply</button>
        <span className="mute">{range.label} · {range.fromStr} to {range.toStr} ({range.tz.replace("_", " ")})</span>
      </form>
    </div>
  );
}
