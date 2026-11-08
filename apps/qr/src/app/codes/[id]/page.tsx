import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, clients, qrCodes, qrTemplates, destinationHistory } from "@e-suite/db";
import { requireUser, canEdit } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Studio } from "@/components/Studio";
import { redirectBase } from "@/lib/codes";

export const dynamic = "force-dynamic";

export default async function EditCode({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [code] = await db.select().from(qrCodes).where(eq(qrCodes.id, id));
  if (!code) notFound();
  const [client] = await db.select().from(clients).limit(1);
  const templates = await db.select().from(qrTemplates).orderBy(desc(qrTemplates.createdAt));
  const history = await db.select().from(destinationHistory).where(eq(destinationHistory.qrCodeId, id)).orderBy(desc(destinationHistory.changedAt));
  return (
    <Shell user={user}>
      <h1>{code.campaignName}</h1>
      <Studio
        redirectBase={redirectBase(client.redirectDomain)}
        templates={templates.map((t: any) => ({ id: t.id, name: t.name, style: t.style }))}
        readOnly={!canEdit(user)}
        existing={{
          id: code.id, mode: code.mode, slug: code.slug, campaignName: code.campaignName, destinationUrl: code.destinationUrl,
          utmSource: code.utmSource ?? "", utmMedium: code.utmMedium ?? "", utmCampaign: code.utmCampaign ?? "",
          utmContent: code.utmContent ?? "", utmTerm: code.utmTerm ?? "", status: code.status === "paused" ? "paused" : "active",
          expiresAt: code.expiresAt ? code.expiresAt.toISOString().slice(0, 10) : "", expireRedirectUrl: code.expireRedirectUrl ?? "",
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
    </Shell>
  );
}
