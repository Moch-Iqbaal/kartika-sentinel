import assert from "node:assert/strict";
import test from "node:test";
import { resolveModelEndpoint } from "./local-indobert.ts";

const KEYS = ["LOCAL_HOAX_URL", "LOCAL_MODEL_TOKEN"] as const;

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const previous = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, values);
  try {
    run();
  } finally {
    for (const key of KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test("alamat bawaan adalah loopback", () => {
  withEnv({}, () => {
    const target = resolveModelEndpoint();
    assert.equal(target?.remote, false);
    assert.equal(target?.url.hostname, "127.0.0.1");
  });
});

test("Cloud Run https ditolak tanpa token layanan", () => {
  withEnv({ LOCAL_HOAX_URL: "https://kartika-hoax-abc.a.run.app/classify" }, () => {
    assert.equal(resolveModelEndpoint(), null);
  });
});

test("https jarak jauh diterima bila token ada", () => {
  withEnv({
    LOCAL_HOAX_URL: "https://kartika-hoax-abc.a.run.app/classify",
    LOCAL_MODEL_TOKEN: "rahasia-layanan",
  }, () => {
    const target = resolveModelEndpoint();
    assert.equal(target?.remote, true);
    assert.equal(target?.url.hostname, "kartika-hoax-abc.a.run.app");
  });
});

test("http ke alamat publik ditolak", () => {
  withEnv({
    LOCAL_HOAX_URL: "http://203.0.113.10/classify",
    LOCAL_MODEL_TOKEN: "rahasia-layanan",
  }, () => {
    assert.equal(resolveModelEndpoint(), null);
  });
});
