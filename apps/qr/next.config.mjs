/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ["@e-suite/db"],
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};
