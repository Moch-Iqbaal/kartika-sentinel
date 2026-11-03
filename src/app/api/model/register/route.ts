import { NextResponse } from "next/server";
import { upsertModelEndpoint } from "@/lib/model/endpoint-store";
import { bearerSecret, classifyUrl, secretsMatch } from "@/lib/model/register";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = rateLimit("model-register", 30, 60_000);
  if (!limit.ok) {
    return NextResponse.json({ error: "Terlalu sering." }, { status: 429 });
  }
  const expected = process.env.MODEL_REGISTER_SECRET?.trim() ?? "";
  if (!expected) {
    return NextResponse.json({ error: "Pendaftaran model belum diatur." }, { status: 503 });
  }
  const given = bearerSecret(request.headers.get("authorization"));
  if (!secretsMatch(given, expected)) {
    return NextResponse.json({ error: "Rahasia pendaftaran ditolak." }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as { url?: string; token?: string } | null;
  const url = classifyUrl(body?.url ?? "");
  const token = (body?.token ?? "").trim();
  if (!url || token.length < 16 || token.length > 128) {
    return NextResponse.json({ error: "URL atau token tidak valid." }, { status: 400 });
  }
  try {
    await upsertModelEndpoint(url.href, token);
  } catch {
    return NextResponse.json({ error: "Endpoint model tidak tersimpan." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
