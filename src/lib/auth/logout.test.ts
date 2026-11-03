import assert from "node:assert/strict";
import test from "node:test";
import { accessGate } from "./gate.ts";
import { cookiesToExpire, SESSION_COOKIE, sessionCookieOptions, shouldExpireCookie } from "./token.ts";

test("keluar menghapus sesi aplikasi dengan path dan masa berlaku habis", () => {
  const [cookie] = cookiesToExpire([]);
  const options = sessionCookieOptions();
  assert.equal(cookie?.name, SESSION_COOKIE);
  assert.equal(cookie?.value, "");
  assert.equal(cookie?.path, "/");
  assert.equal(cookie?.maxAge, 0);
  assert.equal(cookie?.httpOnly, true);
  assert.equal(cookie?.secure, options.secure);
  assert.equal(cookie?.sameSite, "lax");
  assert.ok(cookie && cookie.expires.getTime() === 0);
});

test("keluar juga menghapus cookie Supabase dengan atribut bawaan pustakanya", () => {
  const cookies = cookiesToExpire(["sb-abc-auth-token", "sb-abc-auth-token.0", "lain"]);
  const names = cookies.map((cookie) => cookie.name);
  assert.deepEqual(names.sort(), ["ks_session", "sb-abc-auth-token", "sb-abc-auth-token.0"].sort());
  const supabase = cookies.find((cookie) => cookie.name === "sb-abc-auth-token");
  assert.equal(supabase?.httpOnly, false);
  assert.equal(supabase?.secure, false);
  assert.equal(supabase?.path, "/");
  assert.equal(supabase?.maxAge, 0);
  assert.equal(shouldExpireCookie("theme"), false);
});

test("proxy mengirim pengunjung tanpa sesi ke login", () => {
  assert.equal(accessGate("/", false), "login");
  assert.equal(accessGate("/analisis", false), "login");
  assert.equal(accessGate("/api/analisis", false), "unauthorized");
  assert.equal(accessGate("/login", false), "allow");
  assert.equal(accessGate("/login", true), "home");
  assert.equal(accessGate("/", true), "allow");
  assert.equal(accessGate("/api/auth/logout", false), "allow");
});
