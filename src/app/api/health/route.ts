import { NextResponse } from "next/server";
import { loadLinearModel } from "@/lib/model/linear";
import { localIndoBertHealth } from "@/lib/model/local-indobert";
import { configuredBackend } from "@/lib/db/backend";

export const runtime = "nodejs";

export async function GET() {
  const indobert = await localIndoBertHealth();
  return NextResponse.json({
    ok: true,
    indobert,
    datastore: configuredBackend(),
    linear: loadLinearModel() ? "siap" : "tidak ada",
    model: "umn-cyber/indobert-hoax",
    tokenizer: "indobenchmark/indobert-base-p1",
  });
}
