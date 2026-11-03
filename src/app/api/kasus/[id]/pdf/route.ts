import { NextResponse } from "next/server";
import { isSession, requireSession } from "@/lib/auth/guard";
import { getCase } from "@/lib/db";
import { casePdf } from "@/lib/export/pdf";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!isSession(session)) return session;
  const { id } = await context.params;
  const detail = await getCase(id);
  if (!detail) return NextResponse.json({ error: "Peringatan tidak ditemukan." }, { status: 404 });
  const bytes = await casePdf(detail);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="kartika-${id.slice(0, 8)}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
