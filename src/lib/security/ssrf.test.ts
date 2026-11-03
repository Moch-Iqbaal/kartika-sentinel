import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicHttpUrl, isBlockedIp, UnsafeUrlError } from "./ssrf.ts";

test("menolak IP privat, loopback, dan metadata", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.4", "169.254.169.254", "::1", "fe80::1"]) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
  assert.equal(isBlockedIp("8.8.8.8"), false);
});

test("menolak skema, kredensial, dan port aneh", () => {
  assert.throws(() => assertPublicHttpUrl("file:///etc/passwd"), UnsafeUrlError);
  assert.throws(() => assertPublicHttpUrl("http://127.0.0.1/latest/meta-data"), UnsafeUrlError);
  assert.throws(() => assertPublicHttpUrl("http://localhost/admin"), UnsafeUrlError);
  assert.throws(() => assertPublicHttpUrl("https://user:pass@example.com/a"), UnsafeUrlError);
  assert.throws(() => assertPublicHttpUrl("https://example.com:22/a"), UnsafeUrlError);
  const ok = assertPublicHttpUrl("https://www.youtube.com/watch?v=abc");
  assert.equal(ok.hostname, "www.youtube.com");
});
