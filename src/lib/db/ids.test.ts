import assert from "node:assert/strict";
import test from "node:test";
import { stableUuid } from "./ids.ts";
import { configuredBackend } from "./backend.ts";

test("uuid stabil berbentuk kanonik dan tidak berubah", () => {
  const id = stableUuid("curated-gaza-20000");
  assert.equal(id, stableUuid("curated-gaza-20000"));
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("tanpa kredensial Supabase backend tetap sqlite", () => {
  const previous = process.env.DATA_BACKEND;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.DATA_BACKEND;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.equal(configuredBackend(), "sqlite");
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-bukan-nilai-asli";
    assert.equal(configuredBackend(), "supabase");
    process.env.DATA_BACKEND = "sqlite";
    assert.equal(configuredBackend(), "sqlite");
  } finally {
    if (previous === undefined) delete process.env.DATA_BACKEND;
    else process.env.DATA_BACKEND = previous;
    if (url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = url;
    if (key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = key;
  }
});
