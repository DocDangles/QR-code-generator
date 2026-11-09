import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, clients, qrCodes, qrTemplates, destinationHistory } from "@e-suite/db";
import { requireUser, canEdit } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Studio } from "@/components/Studio";
import { redirectBase } from "@/lib/codes";
import { RangeFilter } from "@/components/RangeFilter";
import { BarList, Legend, LineChart, StatBox } from "@/components/charts";
import { GeoMaps } from "@/components/GeoMaps";
import { expiryToLocalDate, parseRange } from "@/lib/range";
import { codeStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

type SP = { tab?: string; range?: string; from?: string; to?: string };

export default async function EditCode({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [code] = await db.select().from(qrCodes).where(eq(qrCodes.id, id));
  if (!code) notFound();
  const [client] = await db.select().from(clients).limit(1);
  const templates = await db.select().from(qrTemplates).orderBy(desc(qrTemplates.createdAt));
  const history = await db.select().from(destinationHistory).where(eq(destinationHistory.qrCodeId, id)).orderBy(desc(destinationHistory.changedAt));
  const tracked = code.mode === "dynamic";
  const tab = tracked && sp.tab !== "design" ? "stats" : "design";
  const range = parseRange(sp, client.timezone);
  const stats = tab === "stats" ? await codeStats(db, id, range) : null;
  const shortLink = tracked ? `${redirectBase(client.redirectDomain)}/${code.slug}` : null;
  return (
    <Shell user={user}>
      <h1>{code.campaignName}</h1>
      <p className="mute" style={{ margin: 0, wordBreak: "break-all" }}>
        {tracked ? <>Short link <code>{shortLink}</code> → </> : "Static code → "}<a href={code.destinationUrl}>{code.destinationUrl}</a> · {code.status}
        {code.expiresAt && <> · expires end of {expiryToLocalDate(code.expiresAt, client.timezone)}</>}{code.passwordHash && <> · password protected</>}
      </p>
      <div className="row" style={{ margin: "10px 0 0" }}>
        <a className="btn" href={`/api/codes/${code.id}/image?format=svg`}>Download SVG</a>
        <a className="btn" href={`/api/codes/${code.id}/image?format=png`}>Download PNG</a>
      </div>
      <nav className="tabs" aria-label="Code sections">
        {tracked && <a href={`/codes/${id}`} aria-current={tab === "stats" ? "page" : undefined}>Scans</a>}
        <a href={`/codes/${id}?tab=design`} aria-current={tab === "design" ? "page" : undefined}>Design &amp; settings</a>
      </nav>
      {!tracked && <p className="mute">Static codes carry the destination inside the image, so scans can't be counted. Create a dynamic code if you need tracking.</p>}
      {stats && (
        <>
          <RangeFilter range={range} base={`/codes/${id}`} keep={{}} />
          <div className="stats">
            <StatBox label="Scans" value={stats.total} sub="Bots excluded" />
            <StatBox label="Unique clicks" value={stats.uniques} />
          </div>
          {stats.hasArchive && <p className="mute">This range includes daily summaries from before the retention period. Those keep totals, devices and countries; OS, browser, region and city detail is no longer stored for them.</p>}
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Scans over time <span className="mute">({range.hourly ? "hourly" : "daily"})</span></h2>
            <LineChart points={stats.points} hourly={range.hourly} /><Legend />
          </div>
          <div className="cols" style={{ marginTop: 16 }}>
            <div className="card"><h2 style={{ marginTop: 0 }}>Device</h2><BarList items={stats.device} /></div>
            <div className="card"><h2 style={{ marginTop: 0 }}>Operating system</h2><BarList items={stats.os} /></div>
            <div className="card"><h2 style={{ marginTop: 0 }}>Browser</h2><BarList items={stats.browser} /></div>
          </div>
          <h2>Where people scanned</h2>
          <div className="card"><GeoMaps countriesData={stats.countries} regionsData={stats.regions} /></div>
          <div className="cols" style={{ marginTop: 16 }}>
            <div className="card"><h2 style={{ marginTop: 0 }}>Top countries</h2><BarList items={stats.countries.slice(0, 8)} /></div>
            <div className="card"><h2 style={{ marginTop: 0 }}>Top regions</h2><BarList items={stats.regions.slice(0, 8)} /></div>
            <div className="card"><h2 style={{ marginTop: 0 }}>Top cities</h2><BarList items={stats.cities} /></div>
          </div>
        </>
      )}
      {tab === "design" && (<>
      <Studio
        redirectBase={redirectBase(client.redirectDomain)}
        templates={templates.map((t: any) => ({ id: t.id, name: t.name, style: t.style }))}
        readOnly={!canEdit(user)}
        notifyEmail={client.notifyEmail}
        existing={{
          id: code.id, mode: code.mode, slug: code.slug, campaignName: code.campaignName, destinationUrl: code.destinationUrl,
          utmSource: code.utmSource ?? "", utmMedium: code.utmMedium ?? "", utmCampaign: code.utmCampaign ?? "",
          utmContent: code.utmContent ?? "", utmTerm: code.utmTerm ?? "", status: code.status === "paused" ? "paused" : "active",
          expiresAt: code.expiresAt ? expiryToLocalDate(code.expiresAt, client.timezone) : "",
          hasPassword: !!code.passwordHash, notifyRules: (code.notifyRules ?? {}) as any, expireRedirectUrl: code.expireRedirectUrl ?? "",
          style: code.style,
        }}
      />
      {history.length > 0 && (
        <>
          <h2>Destination history</h2>
          <table><thead><tr><th>When</th><th>From</th><th>To</th></tr></thead><tbody>
            {history.map((h: any) => (<tr key={h.id}><td>{h.changedAt.toISOString().slice(0, 16).replace("T", " ")} UTC</td><td className="mute" style={{ wordBreak: "break-all" }}>{h.oldUrl}</td><td style={{ wordBreak: "break-all" }}>{h.newUrl}</td></tr>))}
          </tbody></table>
        </>
      )}
      </>)}
    </Shell>
  );
}
