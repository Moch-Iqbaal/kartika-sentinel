export type Verdict = "hoax" | "misleading" | "true" | "unverified";

export type FactCheck = {
  id: string;
  source: string;
  title: string;
  claim: string;
  verdict: Verdict;
  url: string | null;
  publishedAt: string | null;
  summary: string;
  license: string;
};

export type FactMatch = FactCheck & { similarity: number };

export type ExternalFact = {
  source: string;
  title: string;
  url: string | null;
  rating: string | null;
  publisher: string | null;
  /** Tanggal terbit dari sumber, YYYY-MM-DD bila diketahui. Kosong bila sumber tidak menyebut tanggal. */
  publishedAt?: string | null;
};
