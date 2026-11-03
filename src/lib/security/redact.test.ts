import assert from "node:assert/strict";
import test from "node:test";
import { hashHandle, redactSensitive } from "./redact.ts";

test("menyembunyikan nomor, NIK, dan alamat", () => {
  const clean = redactSensitive(
    "Hubungi 0812-3456-7890 NIK 3174091501010001 di Jl. Melati No. 12 RT 04 RW 05",
  );
  assert.equal(clean.includes("0812"), false);
  assert.equal(clean.includes("3174091501010001"), false);
  assert.match(clean, /nomor disamarkan/);
  assert.match(clean, /nik disamarkan/);
  assert.match(clean, /alamat disamarkan/);
});

test("hash pegangan tidak sama dengan teks asli", () => {
  const hash = hashHandle("kanal-demo-01");
  assert.ok(hash);
  assert.equal(hash?.includes("kanal-demo-01"), false);
  assert.equal(hash, hashHandle("Kanal-Demo-01"));
});
