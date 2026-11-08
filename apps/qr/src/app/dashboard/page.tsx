import { desc, eq, sql } from "drizzle-orm";
import { getDb, qrCodes, clients, scans } from "@e-suite/db";
import { requireUser, canEdit } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { qrTarget } from "@/lib/codes";
import { renderQrSvg } from "@/lib/qr/render";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const q = await searchParams;
  const db = await getDb();
  const [client] = await db.select().from(clients).limit(1);
  const rows = await db.select().from(qrCodes).orderBy(desc(qrCodes.createdAt));
  const counts = await db.select({ id: scans.qrCodeId, n: sql<number>`count(*)::int` }).from(scans).where(eq(scans.bot, false)).groupBy(scans.qrCodeId);
  const byId = new Map<string, number>(counts.map((c: any) => [c.id, c.n]));
  return (
    <Shell user={user}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{client?.name ?? "QR codes"}</h1>
        {canEdit(user) && <a className="btn primary" href="/codes/new">New QR code</a>}
      </div>
      {q.denied && <p className="err">You don't have permission for that.</p>}
      {rows.length === 0 ? <p className="mute">No codes yet.</p> : (
        <table>
          <thead><tr><th>Campaign</th><th>Type</th><th>ID</th><th>Scans</th><th>Status</th><th>Code</th></tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id}>
                <td><a href={`/codes/${r.id}`}>{r.campaignName}</a></td>
                <td>{r.mode === "static" ? "Static" : "Dynamic"}</td>
                <td>{r.slug ?? <span className="mute">n/a</span>}</td>
                <td>{r.mode === "static" ? <span className="mute" title="Static codes can't be tracked">not tracked</span> : (byId.get(r.id) ?? 0)}</td>
                <td>{r.status}</td>
                <td style={{ width: 64 }}><div style={{ width: 56 }} dangerouslySetInnerHTML={{ __html: client ? renderQrSvg(qrTarget(r, client.redirectDomain), r.style) : "" }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Shell>
  );
}
