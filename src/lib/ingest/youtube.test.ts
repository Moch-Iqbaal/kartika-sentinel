import assert from "node:assert/strict";
import test from "node:test";
import {
  assembleYoutube,
  captionRequestUrl,
  chooseCaptionTrack,
  parseAttributedDescription,
  parsePlayerResponse,
  parseTimedText,
  parseTranscriptParams,
  youtubeVideoId,
  YOUTUBE_ONLY_TITLE_NOTE,
} from "./youtube.ts";

const PLAYER = `<html><script>var ytInitialPlayerResponse = ${JSON.stringify({
  videoDetails: {
    title: "Judul uji video",
    author: "Kanal Uji",
    shortDescription: "Deskripsi lengkap tentang isi video ini.",
  },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        { baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=en", languageCode: "en" },
        { baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=id&kind=asr", languageCode: "id", kind: "asr" },
        { baseUrl: "https://www.youtube.com/api/timedtext?v=abc&lang=id", languageCode: "id" },
      ],
    },
  },
})};</script></html>`;

test("mengenali watch, youtu.be, dan shorts", () => {
  assert.equal(youtubeVideoId(new URL("https://www.youtube.com/watch?v=0uecxWhlS-w")), "0uecxWhlS-w");
  assert.equal(youtubeVideoId(new URL("https://youtu.be/0uecxWhlS-w")), "0uecxWhlS-w");
  assert.equal(youtubeVideoId(new URL("https://www.youtube.com/shorts/0uecxWhlS-w")), "0uecxWhlS-w");
  assert.equal(youtubeVideoId(new URL("https://example.com/watch?v=0uecxWhlS-w")), null);
});

test("memilih transkrip Indonesia manual, lalu otomatis, lalu Inggris", () => {
  const details = parsePlayerResponse(PLAYER);
  assert.equal(details?.title, "Judul uji video");
  assert.equal(details?.description, "Deskripsi lengkap tentang isi video ini.");
  assert.equal(chooseCaptionTrack(details?.captions ?? [])?.languageCode, "id");
  assert.equal(chooseCaptionTrack(details?.captions ?? [])?.kind, undefined);
  const withoutManual = (details?.captions ?? []).filter((track) => track.kind === "asr" || track.languageCode === "en");
  assert.equal(chooseCaptionTrack(withoutManual)?.kind, "asr");
  assert.equal(chooseCaptionTrack(withoutManual.filter((track) => track.languageCode === "en"))?.languageCode, "en");
});

test("timedtext XML dan json3 menjadi teks biasa", () => {
  assert.equal(parseTimedText("<transcript><text>Halo &amp; dunia</text><text>lanjutan</text></transcript>"), "Halo & dunia lanjutan");
  const rolling = JSON.stringify({
    events: [
      { segs: [{ utf8: "Halo" }] },
      { segs: [{ utf8: "Halo dunia" }] },
    ],
  });
  assert.equal(parseTimedText(rolling), "Halo dunia");
});

test("tautan takarir di luar YouTube ditolak", () => {
  assert.equal(captionRequestUrl("https://evil.example/timedtext"), null);
  assert.match(captionRequestUrl("https://www.youtube.com/api/timedtext?v=abc&lang=id") ?? "", /fmt=json3/);
});

test("deskripsi tetap terbaca bila videoDetails disembunyikan", () => {
  const html = `<script>{"attributedDescription":{"content":"JAKARTA, KOMPAS.TV - uraian panjang tentang program makan."},"getTranscriptEndpoint":{"params":"CgswdWVjeA=="}}</script>`;
  assert.match(parseAttributedDescription(html) ?? "", /KOMPAS\.TV/);
  assert.equal(parseTranscriptParams(html), "CgswdWVjeA==");
});

test("hanya judul tetap jujur, gabungan menyebut bagian yang ada", () => {
  const only = assembleYoutube({ title: "Judul saja", channel: "Kanal", description: null, transcript: null });
  assert.deepEqual(only.parts, ["judul"]);
  assert.equal(only.note, YOUTUBE_ONLY_TITLE_NOTE);
  assert.equal(only.bodyChars, 0);
  const full = assembleYoutube({
    title: "Judul",
    channel: "Kanal",
    description: "Ada deskripsi.",
    transcript: "Ada transkrip yang cukup panjang untuk dinilai.",
  });
  assert.deepEqual(full.parts, ["judul", "deskripsi", "transkrip"]);
  assert.match(full.text, /Ada transkrip/);
  assert.match(full.note, /judul, keterangan, dan ucapan/);
});
