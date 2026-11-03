import { NextResponse } from "next/server";
import { scoreContent } from "@/lib/analyze/score";
import { isSession, requireSession } from "@/lib/auth/guard";
import { corpusFromDb, getCase, rescoreAlert } from "@/lib/db";
import { searchGoogleFactChecks } from "@/lib/factcheck/google";
import { rateLimit } from "@/lib/security/rate-limit";
import { assertSameOrigin } from "@/lib/security/untrusted";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!isSession(session)) return session;
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Origin ditolak." }, { status: 403 });
  }
  const limit = rateLimit(`reskor:${session.sub}`, 15, 10 * 60 * 1000);
  if (!limit.ok) return NextResponse.json({ error: "Terlalu sering." }, { status: 429 });
  const { id } = await context.params;
  const detail = await getCase(id);
  if (!detail) return NextResponse.json({ error: "Peringatan tidak ditemukan." }, { status: 404 });
  try {
    const card = await scoreContent(detail.text, detail.virality, await corpusFromDb(), true);
    const external = await searchGoogleFactChecks(detail.text);
    await rescoreAlert(session, id, card, external);
    return NextResponse.json({ ok: true, engine: card.assessment.engine });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Skor ulang gagal.";
    const status = message.includes("hanya") ? 403 : 500;
    return NextResponse.json({ error: status === 500 ? "Skor ulang gagal." : message }, { status });
  }
}
