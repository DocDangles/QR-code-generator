import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as schema from "./schema.ts";

export * from "./schema.ts";
export { schema };

type Db = any; // postgres-js and PGlite drizzle instances share the query API
// One handle per process, shared across Next route bundles (two PGlite instances on one folder would corrupt it).
const g = globalThis as unknown as { __esDb?: Promise<Db> };

/**
 * Production / Railway: DATABASE_URL points at Postgres.
 * Local dev and tests: no DATABASE_URL -> embedded PGlite in ~/.cache/e-suite/pglite (outside the repo,
 * or Next's file watcher sees every DB write as a code change and reloads in a loop).
 */
export function getDb(): Promise<Db> {
  return (g.__esDb ??= open());
}

async function open(): Promise<Db> {
  let cached: Db;
  const url = process.env.DATABASE_URL;
  if (url) {
    const [{ drizzle }, { default: postgres }] = await Promise.all([
      import("drizzle-orm/postgres-js"),
      import("postgres"),
    ]);
    cached = drizzle(postgres(url, { max: 5 }), { schema });
  } else {
    const [{ drizzle }, { PGlite }] = await Promise.all([
      import("drizzle-orm/pglite"),
      import("@electric-sql/pglite"),
    ]);
    const dir = process.env.PGLITE_DIR ?? join(homedir(), ".cache", "e-suite", "pglite");
    mkdirSync(dir, { recursive: true });
    cached = drizzle(new PGlite(dir), { schema });
  }
  return cached;
}
