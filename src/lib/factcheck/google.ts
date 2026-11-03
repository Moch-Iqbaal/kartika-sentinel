import type { ExternalFact } from "@/lib/factcheck/types";

/**
 * Google Fact Check Tools bersifat opsional. Tanpa kunci, fungsi mengembalikan
 * daftar kosong dan analisis tetap selesai.
 */
export async function searchGoogleFactChecks(query: string): Promise<ExternalFact[]> {
  const key = process.env.GOOGLE_FACTCHECK_API_KEY?.trim();
  if (!key) return [];
  const url = new URL("https://factchecktools.googleapis.com/v1alpha1/claims:search");
  url.searchParams.set("query", query.slice(0, 240));
  url.searchParams.set("languageCode", "id");
  url.searchParams.set("pageSize", "5");
  url.searchParams.set("key", key);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return [];
    const payload = (await response.json()) as {
      claims?: Array<{
        text?: string;
        claimReview?: Array<{
          title?: string;
          url?: string;
          textualRating?: string;
          publisher?: { name?: string };
        }>;
      }>;
    };
    const rows: ExternalFact[] = [];
    for (const claim of payload.claims ?? []) {
      const review = claim.claimReview?.[0];
      if (!review) continue;
      rows.push({
        source: "Google Fact Check Tools",
        title: review.title || claim.text || "Klaim",
        url: review.url && /^https?:\/\//.test(review.url) ? review.url : null,
        rating: review.textualRating ?? null,
        publisher: review.publisher?.name ?? null,
      });
    }
    return rows.slice(0, 5);
  } catch {
    return [];
  }
}
