import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as schema from "./schema.ts";

export * from "./schema.ts";
export { schema };

/** Walk up from cwd to the monorepo root (package.json with "workspaces"). */
function repoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg) && JSON.parse(readFileSync(pkg, "utf8")).workspaces) return dir;
    const up = dirname(dir);
    if (up === dir) return process.cwd();
    dir = up;
  }
}

type Db = any; // postgres-js and PGlite drizzle instances share the query API
let cached: Db | undefined;

/**
 * Production / Railway: DATABASE_URL points at Postgres.
 * Local dev and tests: no DATABASE_URL -> embedded PGlite in .data/pglite.
 */
export async function getDb(): Promise<Db> {
  if (cached) return cached;
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
    const dir = process.env.PGLITE_DIR ?? join(repoRoot(), ".data/pglite");
    mkdirSync(dir, { recursive: true });
    cached = drizzle(new PGlite(dir), { schema });
  }
  return cached;
}
