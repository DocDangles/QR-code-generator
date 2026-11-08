import { fileURLToPath } from "node:url";
import { getDb } from "./index.ts";

const folder = fileURLToPath(new URL("../drizzle", import.meta.url));
const db = await getDb();
if (process.env.DATABASE_URL) {
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  await migrate(db, { migrationsFolder: folder });
} else {
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db, { migrationsFolder: folder });
}
console.log("migrations applied");
process.exit(0);
