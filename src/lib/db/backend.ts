export type DataBackend = "sqlite" | "supabase";

/** SQLite bila kredensial Supabase tidak lengkap, atau DATA_BACKEND=sqlite. */
export function configuredBackend(): DataBackend {
  if (process.env.DATA_BACKEND === "sqlite") return "sqlite";
  if (process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return "supabase";
  return "sqlite";
}
