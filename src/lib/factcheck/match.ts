import { cosine, embedText } from "@/lib/embed/hashing";
import { compareByRecency } from "@/lib/factcheck/recency";
import type { FactCheck, FactMatch } from "@/lib/factcheck/types";

export { MATCH_MIN_SIMILARITY, strongMatches } from "@/lib/factcheck/threshold";

export function matchFactChecks(text: string, corpus: FactCheck[], limit = 5, now = new Date()): FactMatch[] {
  const query = embedText(text);
  return corpus
    .map((row) => ({
      ...row,
      similarity: cosine(query, embedText(`${row.title}\n${row.claim}\n${row.summary}`)),
    }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit)
    .sort((left, right) => compareByRecency(left, right, now));
}
