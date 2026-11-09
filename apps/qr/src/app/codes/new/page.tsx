import { desc } from "drizzle-orm";
import { getDb, clients, qrTemplates } from "@e-suite/db";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { Studio } from "@/components/Studio";
import { redirectBase } from "@/lib/codes";

export const dynamic = "force-dynamic";

export default async function NewCode() {
  const user = await requireUser(["admin", "client_editor"]);
  const db = await getDb();
  const [client] = await db.select().from(clients).limit(1);
  const templates = await db.select().from(qrTemplates).orderBy(desc(qrTemplates.createdAt));
  return (
    <Shell user={user}>
      <h1>New QR code</h1>
      <Studio notifyEmail={client.notifyEmail} redirectBase={redirectBase(client.redirectDomain)} templates={templates.map((t: any) => ({ id: t.id, name: t.name, style: t.style }))} />
    </Shell>
  );
}
