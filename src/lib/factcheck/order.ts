export function hasHttpUrl(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Tautan sumber didahulukan, lalu kemiripan. */
export function evidenceFirst<T extends { url: string | null; similarity: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const link = Number(hasHttpUrl(right.url)) - Number(hasHttpUrl(left.url));
    if (link !== 0) return link;
    return right.similarity - left.similarity;
  });
}
