/**
 * Pemeriksaan metadata gambar, bukan detektor piksel dan bukan validasi C2PA penuh.
 * Yang dilakukan: memindai byte berkas untuk nama perangkat lunak pembuat
 * dan penanda teks "c2pa" / "jumbf". Ketidakhadiran metadata tidak berarti gambar asli.
 */

export type ImageMetadataReport = {
  checked: boolean;
  contentType: string;
  bytes: number;
  generatorHint: string | null;
  c2paMarker: boolean;
  signals: string[];
  disclaimer: string;
};

const DISCLAIMER =
  "Pemeriksaan ini hanya membaca metadata dan rangkaian byte. Ia tidak menilai piksel, tidak memverifikasi tanda tangan C2PA, dan tidak membuktikan gambar asli atau palsu.";

const GENERATORS: Array<[RegExp, string]> = [
  [/stable\s*diffusion/i, "Stable Diffusion"],
  [/midjourney/i, "Midjourney"],
  [/dall[\s.-]?e/i, "DALL-E"],
  [/adobe firefly|firefly/i, "Adobe Firefly"],
  [/comfyui/i, "ComfyUI"],
  [/novelai/i, "NovelAI"],
];

export function inspectImage(bytes: Uint8Array, contentType: string): ImageMetadataReport {
  const ascii = new TextDecoder("latin1").decode(bytes);
  const signals: string[] = [];
  let generatorHint: string | null = null;
  for (const [pattern, name] of GENERATORS) {
    if (pattern.test(ascii)) {
      generatorHint = name;
      signals.push(`Byte berkas memuat nama pembuat "${name}". Ini bisa berasal dari metadata, bukan dari piksel.`);
      break;
    }
  }
  const software = ascii.match(/Software\0{0,4}([^\0\n\r]{3,60})/);
  if (software && !generatorHint) {
    signals.push(`Tag Software terbaca: ${software[1].trim()}.`);
  }
  const c2paMarker = /c2pa|jumbf/i.test(ascii);
  if (c2paMarker) {
    signals.push("Ada rangkaian byte c2pa atau jumbf. Penanda ini bisa berarti kredensial konten, bukan vonis palsu. Tanda tangan tidak diverifikasi.");
  }
  if (signals.length === 0) {
    signals.push("Tidak ada nama pembuat atau penanda C2PA yang dikenali. Metadata kosong tidak membuktikan gambar itu asli.");
  }
  return {
    checked: true,
    contentType,
    bytes: bytes.byteLength,
    generatorHint,
    c2paMarker,
    signals,
    disclaimer: DISCLAIMER,
  };
}
