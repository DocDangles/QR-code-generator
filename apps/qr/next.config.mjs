import { fileURLToPath } from "node:url";

// Pin the workspace root. Without it Next walks up looking for a lockfile and can pick a parent folder
// (e.g. a stray ~/package-lock.json), then watches that whole tree and reloads on unrelated file writes.
const root = fileURLToPath(new URL("../..", import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  turbopack: { root },
  outputFileTracingRoot: root,
  transpilePackages: ["@e-suite/db"],
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "sharp", "zxing-wasm"],
};
