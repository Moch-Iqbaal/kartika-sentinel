import { NextResponse } from "next/server";
import { applyShortTextCaution } from "@/lib/analyze/apply-short-text";
import { scoreContent } from "@/lib/analyze/score";
import { isSession, requireSession } from "@/lib/auth/guard";
import { corpusFromDb, ensureReady, saveScoredAlert } from "@/lib/db";
import { searchGoogleFactChecks } from "@/lib/factcheck/google";
import { textFromUrl } from "@/lib/ingest/url-text";
import { inspectImage } from "@/lib/media/metadata";
import { applyImageReport } from "@/lib/model/ai-text";
import { safeFetchBytes } from "@/lib/security/ssrf";
import { rateLimit } from "@/lib/security/rate-limit";
import { UnsafeUrlError } from "@/lib/security/ssrf";
import { assertSameOrigin } from "@/lib/security/untrusted";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireSession();
  if (!isSession(session)) return session;
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ error: "Origin ditolak." }, { status: 403 });
  }
  const limit = rateLimit(`analisis:${session.sub}`, 15, 10 * 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Batas analisis tercapai. Coba lagi nanti." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } },
    );
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 32_768) return NextResponse.json({ error: "Badan permintaan terlalu besar." }, { status: 413 });
  const body = (await request.json().catch(() => null)) as { kind?: string; text?: string; url?: string } | null;
  if (!body || (body.kind !== "text" && body.kind !== "url" && body.kind !== "gambar")) {
    return NextResponse.json({ error: "Masukan tidak dikenali." }, { status: 400 });
  }
  try {
    await ensureReady();
    let raw = "";
    let url: string | null = null;
    let author: string | null = null;
    let bodyChars: number | null = null;
    let image: Awaited<ReturnType<typeof inspectImage>> | null = null;
    if (body.kind === "gambar") {
      const target = (body.url ?? "").trim();
      const fetched = await safeFetchBytes(target);
      image = inspectImage(fetched.bytes, fetched.contentType);
      raw = `Berkas gambar ${fetched.contentType}. ${image.signals.join(" ")}`;
      url = fetched.finalUrl;
    } else if (body.kind === "url") {
      const target = (body.url ?? "").trim();
      if (target.length < 8 || target.length > 2000) {
        return NextResponse.json({ error: "URL tidak valid." }, { status: 400 });
      }
      const extracted = await textFromUrl(target);
      raw = extracted.text;
      url = extracted.finalUrl;
      author = extracted.authorHandle;
      bodyChars = extracted.bodyChars;
    } else {
      raw = body.text ?? "";
      if (raw.trim().length < 12) return NextResponse.json({ error: "Teks terlalu pendek." }, { status: 400 });
      if (raw.length > 6000) return NextResponse.json({ error: "Teks terlalu panjang." }, { status: 413 });
    }
    if (!raw.trim()) return NextResponse.json({ error: "Tidak ada teks yang bisa dinilai." }, { status: 400 });
    const corpus = await corpusFromDb();
    const card = applyShortTextCaution(await scoreContent(raw, 0, corpus, true), bodyChars);
    card.assessment.ai = applyImageReport(card.assessment.ai, image);
    const external = await searchGoogleFactChecks(card.clean);
    const id = await saveScoredAlert({
      platform: body.kind === "gambar" ? "gambar" : body.kind === "url" ? "url" : "masukan-analis",
      externalId: crypto.randomUUID(),
      url,
      authorHandle: author,
      postedAt: new Date().toISOString(),
      demo: false,
      card,
      metrics: [],
      external,
      actor: session.sub,
    });
    return NextResponse.json({ id });
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("analisis gagal");
    return NextResponse.json({ error: "Analisis gagal diproses." }, { status: 500 });
  }
}
