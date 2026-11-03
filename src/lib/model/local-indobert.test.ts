import assert from "node:assert/strict";
import test from "node:test";
import { indoBertConfigured, resolveModelEndpoint } from "./local-indobert.ts";

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

test("tanpa LOCAL_HOAX_URL tidak ada endpoint", () => {
  withEnv({}, () => {
    assert.equal(resolveModelEndpoint(), null);
  });
});

test("mode ringan bila URL tidak diisi", () => {
  withEnv({}, () => {
    assert.equal(indoBertConfigured(), false);
  });
});

test("https publik ditolak tanpa token layanan", () => {
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
