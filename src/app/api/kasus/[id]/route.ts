import { NextResponse } from "next/server";
import { isSession, requireSession } from "@/lib/auth/guard";
import { openCase, updateAlertStatus, updateCaseStatus } from "@/lib/db/store";
import type { AlertStatus, CaseStatus } from "@/lib/db/types";
import { assertSameOrigin } from "@/lib/security/untrusted";

export const runtime = "nodejs";

const ALERTS = new Set<AlertStatus>(["new", "triaged", "escalated", "dismissed"]);
const CASES = new Set<CaseStatus>(["open", "investigating", "closed"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!isSession(session)) return session;
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Origin ditolak." }, { status: 403 });
  }
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { action?: string; status?: string } | null;
  try {
    if (body?.action === "open") {
      openCase(session, id);
    } else if (body?.action === "alert" && body.status && ALERTS.has(body.status as AlertStatus)) {
      updateAlertStatus(session, id, body.status as AlertStatus);
    } else if (body?.action === "case" && body.status && CASES.has(body.status as CaseStatus)) {
      updateCaseStatus(session, id, body.status as CaseStatus);
    } else {
      return NextResponse.json({ error: "Aksi tidak dikenali." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menyimpan.";
    const status = message.includes("tidak ditemukan") ? 404 : message.includes("hanya") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
