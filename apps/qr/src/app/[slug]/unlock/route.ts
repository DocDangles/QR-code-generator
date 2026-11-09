import type { NextRequest } from "next/server";
import { handleUnlock } from "@/lib/serve";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  return handleUnlock(req, (await ctx.params).slug);
}
