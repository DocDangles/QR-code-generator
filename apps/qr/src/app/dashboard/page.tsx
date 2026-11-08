import { getDb, clients } from "@e-suite/db";
import { requireUser, canEdit } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { RangeFilter } from "@/components/RangeFilter";
import { StatBox } from "@/components/charts";
import { qrTarget } from "@/lib/codes";
import { renderQrSvg } from "@/lib/qr/render";
import { parseRange } from "@/lib/range";
import { codeRows, overview, type SortKey } from "@/lib/stats";

export const dynamic = "force-dynamic";
type SP = { range?: string; from?: string; to?: string; q?: string; sort?: string; dir?: string; denied?: string };
const SORTS: SortKey[] = ["name", "scans", "type"];

export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const db = await getDb();
  const [client] = await db.select().from(clients).limit(1);
  const tz = client?.timezone ?? "America/New_York";
  const range = parseRange(sp, tz);
  const sort = SORTS.includes(sp.sort as SortKey) ? (sp.sort as SortKey) : "scans";
  const dir = sp.dir === "asc" ? "asc" : sp.dir === "desc" ? "desc" : sort === "scans" ? "desc" : "asc";
  const [o, rows] = await Promise.all([overview(db, range), codeRows(db, range, { q: sp.q, sort, dir })]);

  // Range params carried through every link/form so the view stays shareable.
  const rangeParams = sp.from && sp.to ? { from: sp.from, to: sp.to } : { range: range.key };
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...rangeParams, q: sp.q, ...extra })) if (v) p.set(k, v);
    return `/dashboard?${p}`;
  };
  const th = (key: SortKey, label: string) => (
    <th aria-sort={sort === key ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <a href={href({ sort: key, dir: sort === key && dir === (key === "scans" ? "desc" : "asc") ? (dir === "asc" ? "desc" : "asc") : key === "scans" ? "desc" : "asc" })}>
        {label}{sort === key ? (dir === "asc" ? " ▲" : " ▼") : ""}
      </a>
    </th>
  );

  return (
    <Shell user={user}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{client?.name ?? "QR codes"}</h1>
        {canEdit(user) && <a className="btn primary" href="/codes/new">New QR code</a>}
      </div>
      {sp.denied && <p className="err">You don't have permission for that.</p>}
      <RangeFilter range={range} base="/dashboard" keep={{ q: sp.q, sort: sp.sort, dir: sp.dir }} />

      <div className="stats">
        <StatBox label="Codes" value={o.codesActive} sub={`${o.codesTotal} total, including paused`} />
        <StatBox label="Clicks" value={o.clicks} sub="Bots excluded" />
        <StatBox label="Unique clicks" value={o.uniques} sub="First scan per visitor, per code, per day" />
      </div>

      <form method="get" action="/dashboard" className="row" style={{ marginBottom: 8 }}>
        {Object.entries({ ...rangeParams, sort: sp.sort, dir: sp.dir }).map(([k, v]) => v ? <input key={k} type="hidden" name={k} value={v} /> : null)}
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search campaigns" aria-label="Search campaigns" style={{ maxWidth: 280 }} />
        <button className="btn" type="submit">Search</button>
        {sp.q && <a className="btn" href={href({ q: undefined })}>Clear</a>}
      </form>

      {rows.length === 0 ? <p className="mute">{sp.q ? "No campaigns match that search." : "No codes yet."}</p> : (
        <table>
          <thead><tr>{th("name", "Campaign name")}{th("scans", "Scans")}{th("type", "Type")}<th>ID</th><th>Thumbnail</th></tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id}>
                <td><a href={`/codes/${r.id}`}>{r.campaignName}</a>{r.status !== "active" && <span className="mute"> · {r.status}</span>}</td>
                <td>{r.mode === "static" ? <span className="mute" title="Static codes can't be tracked">not tracked</span> : <>{r.scans.toLocaleString("en-US")} <span className="mute" style={{ fontSize: ".8rem" }}>({r.uniques} unique)</span></>}</td>
                <td>{r.mode === "static" ? "Static" : "Dynamic"}</td>
                <td>{r.slug ? <code>{r.slug}</code> : <span className="mute">n/a</span>}</td>
                <td style={{ width: 120 }}>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <div style={{ width: 52, flex: "none" }} dangerouslySetInnerHTML={{ __html: client ? renderQrSvg(qrTarget(r, client.redirectDomain), r.style) : "" }} />
                    <span className="mute" style={{ fontSize: ".8rem" }}><a href={`/api/codes/${r.id}/image?format=svg`}>SVG</a><br /><a href={`/api/codes/${r.id}/image?format=png`}>PNG</a></span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Shell>
  );
}
