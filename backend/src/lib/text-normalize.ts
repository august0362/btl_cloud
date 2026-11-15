/** Shared, accent-preserving normalization for fingerprints and recommendation vectors. */
export function normalizeText(input: string): string {
  return input.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim();
}

export function tokenize(input: string, options: { maxTokens?: number; minLength?: number } = {}): { tokens: string[]; truncated: boolean } {
  const tokens: string[] = [];
  const max = options.maxTokens ?? Infinity;
  const min = options.minLength ?? 1;
  for (const match of normalizeText(input).matchAll(/\S+/gu)) {
    const token = match[0];
    if (Array.from(token).length < min) continue;
    if (tokens.length >= max) return { tokens, truncated: true };
    tokens.push(token);
  }
  return { tokens, truncated: false };
}

/** Accent folding is only for matching, never for fingerprint/vector construction. */
export function foldForMatch(input: string): string {
  return normalizeText(input.normalize('NFD').replace(/\p{M}/gu, '').replace(/[đĐ]/g, 'd'));
}
