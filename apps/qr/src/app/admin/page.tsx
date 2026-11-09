import { asc } from "drizzle-orm";
import { getDb, clients, users } from "@e-suite/db";
import { requireUser } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { ClientSettings, Domain, Housekeeping, Users } from "@/components/AdminPanels";
import { retentionMonths } from "@/lib/retention";

export const dynamic = "force-dynamic";

export default async function Admin() {
  const me = await requireUser(["admin"]);
  const db = await getDb();
  const [client] = await db.select().from(clients).limit(1);
  const people = await db.select().from(users).orderBy(asc(users.email));
  if (!client) return <Shell user={me}><h1>Admin</h1><p className="err">No client is set up. Run the seed (see the deploy README).</p></Shell>;
  return (
    <Shell user={me}>
      <h1>Admin</h1>
      <p className="mute">Settings for this deployment. Each client runs its own copy of this app with its own database, so everything here belongs to {client.name} only.</p>
      <h2>Organization</h2>
      <ClientSettings client={{
        name: client.name, timezone: client.timezone, redirectDomain: client.redirectDomain, fallbackUrl: client.fallbackUrl,
        notifyEmail: client.notifyEmail ?? "", brandColors: client.brandColors ?? [], logoUrl: client.logoUrl ?? "",
      }} />
      <h2>People</h2>
      <Users meId={me.id} users={people.map((u: any) => ({ id: u.id, email: u.email, name: u.name, role: u.role }))} />
      <h2>Domain</h2>
      <Domain domain={client.redirectDomain} />
      <h2>Housekeeping and privacy</h2>
      <Housekeeping months={retentionMonths()} />
    </Shell>
  );
}
