import "server-only";
import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth/session";
import type { Session } from "@/lib/auth/token";

export async function requireSession(): Promise<Session | NextResponse> {
  const session = await currentSession();
  if (!session) {
    return NextResponse.json({ error: "Tidak ada sesi analis." }, { status: 401 });
  }
  return session;
}

export function isSession(value: Session | NextResponse): value is Session {
  return !(value instanceof NextResponse);
}
