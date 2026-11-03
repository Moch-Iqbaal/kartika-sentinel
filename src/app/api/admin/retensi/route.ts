import { NextResponse } from "next/server";
import { isSession, requireSession } from "@/lib/auth/guard";
import { purgeOldDemo } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireSession();
  if (!isSession(session)) return session;
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Retensi hanya untuk admin." }, { status: 403 });
  }
  const removed = await purgeOldDemo(session);
  const response = NextResponse.redirect(new URL(`/audit?dihapus=${removed}`, request.url), 303);
  return response;
}
