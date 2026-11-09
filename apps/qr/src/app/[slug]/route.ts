import type { NextRequest } from "next/server";
import { handleGet } from "@/lib/serve";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  return handleGet(req, (await ctx.params).slug);
}
