import assert from "node:assert/strict";
import test from "node:test";
import { HOAX_ALONE_MIN } from "./bands.ts";
import { credibleReporting, evidenceStance } from "./evidence-stance.ts";
import { buildRingkasan, decideVerdict, scoreVerdict, type RingkasanInput } from "./ringkasan.ts";

/**
 * Angka 62,4% adalah laporan pemilik untuk IndoBERT pada video ini.
 * Bukan pengukuran ulang IndoBERT di mesin uji.
 */
const REPORTED_INDOBERT = 0.624;
const VIDEO = "https://www.youtube.com/watch?v=0uecxWhlS-w";
const TEXT = [
  "Oknum TNI Polri Terjerat Korupsi MBG, Jubir Gerindra: Evaluasi Total Tapi Jangan Dihentikan",
  "Kanal: KOMPASTV JAWA TIMUR",
].join("\n\n");

function input(patch: Partial<RingkasanInput> = {}): RingkasanInput {
  return {
    hoaxScore: REPORTED_INDOBERT,
    band: "prioritas",
    sensitivity: 0.9,
    virality: 0,
    engine: "indobert-local",
    indobert: REPORTED_INDOBERT,
    linear: REPORTED_INDOBERT,
    heuristic: 0.4,
    aiFlagged: false,
    aiConfidence: "rendah",
    shortText: false,
    shortWords: false,
    opinion: false,
    textChars: 1800,
    unscored: false,
    unscoredReason: "",
    topicLabels: ["TNI"],
    matches: [],
    externalCount: 0,
    ...patch,
  };
}

test("label cek fakta tidak tertukar", () => {
  assert.equal(evidenceStance("Salah"), "hoax");
  assert.equal(evidenceStance("Hoaks"), "hoax");
  assert.equal(evidenceStance("true"), "valid");
  assert.equal(evidenceStance("Benar"), "valid");
  assert.equal(evidenceStance("bukan hoaks"), "valid");
  assert.equal(evidenceStance("Cek fakta"), "none");
});

test("video berita 62,4% tidak menjadi HOAKS hanya karena skornya", () => {
  assert.equal(scoreVerdict(REPORTED_INDOBERT), "hoax");
  assert.ok(REPORTED_INDOBERT < HOAX_ALONE_MIN);
  assert.equal(credibleReporting(VIDEO, TEXT), true);
  assert.equal(credibleReporting(VIDEO, "Kanal: akun pribadi"), false);
  const reported = input({ credibleSource: credibleReporting(VIDEO, TEXT) });
  assert.equal(decideVerdict(reported), "uncertain");
  const text = buildRingkasan(reported);
  assert.equal(text.headline, "Belum bisa dipastikan");
  assert.notEqual(text.headline, "Kemungkinan HOAKS");
  assert.match(text.sentences.join(" "), /62,4%/);
  assert.match(text.sentences.join(" "), /media atau rilis resmi|belum cukup/);

  const withoutOutlet = input({ credibleSource: false });
  assert.equal(decideVerdict(withoutOutlet), "uncertain");
  assert.match(buildRingkasan(withoutOutlet).sentences[0], /belum cukup/);
});

test("bukti hoaks pada skor yang sama tetap HOAKS, bukti benar menahannya", () => {
  const backed = input({
    matches: [{ verdict: "hoax", similarity: 0.8 }],
    credibleSource: false,
  });
  assert.equal(decideVerdict(backed), "hoax");
  const denied = input({
    externalRatings: ["Benar"],
    credibleSource: false,
  });
  assert.equal(decideVerdict(denied), "uncertain");
  assert.match(buildRingkasan(denied).sentences[0], /bukan hoaks/);
});
