import { and, eq, lte, isNotNull } from "drizzle-orm";
import { qrCodes, clients } from "@e-suite/db";
import { runDigests } from "./notify";
import { runRetention } from "./retention";

type Db = any;

/**
 * Nightly housekeeping. Idempotent, so it is safe to run hourly or more than once a night.
 *  1. Flip codes past their expiry to "expired" so the list view is accurate (the redirect already checks expiry on every request).
 *  2. Send any digest emails that are due.
 *  3. Roll raw scans past the retention period into daily summaries and prune them.
 */
export async function runNightly(db: Db, now = new Date(), send?: Parameters<typeof runDigests>[3]) {
  const flipped = await db.update(qrCodes).set({ status: "expired", updatedAt: now })
    .where(and(eq(qrCodes.status, "active"), isNotNull(qrCodes.expiresAt), lte(qrCodes.expiresAt, now)))
    .returning({ id: qrCodes.id });
  const [client] = await db.select().from(clients).limit(1);
  const digests = client ? await runDigests(db, client, now, send) : { sent: 0, skippedEmpty: 0, alreadySent: 0 };
  const retention = await runRetention(db, client?.timezone ?? "America/New_York", now);
  return { expired: flipped.length as number, digests, retention };
}
