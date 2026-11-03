import assert from "node:assert/strict";
import test from "node:test";
import { assertScorableText, isNonContentText, NonContentTextError } from "./content-guard.ts";

test("kalimat metadata gambar tidak dinilai", () => {
  const raw = "Berkas gambar image/jpeg. Tidak ada nama pembuat atau penanda C2PA yang dikenali. Metadata kosong tidak membuktikan gambar itu asli.";
  assert.equal(isNonContentText(raw), true);
  assert.throws(() => assertScorableText(raw), NonContentTextError);
});

test("keterangan gambar yang ditulis analis tetap dinilai", () => {
  const caption = "Prajurit TNI menyalurkan makan bergizi gratis di lapangan upacara.";
  assert.equal(isNonContentText(caption), false);
  assert.doesNotThrow(() => assertScorableText(caption));
});

test("teks kosong bukan isi", () => {
  assert.equal(isNonContentText("   "), true);
});
