import { foldForMatch, tokenize } from '../../lib/text-normalize.js';

export const RANKING_POLICY = {
  home: { pref: 0.5, pop: 0.3, fresh: 0.2 },
  cold: { pop: 0.6, fresh: 0.4 },
  related: { content: 0.8, pop: 0.1, fresh: 0.1 },
  search: { pref: 0.5, pop: 0.25, fresh: 0.25 },
  maxDocuments: 5000, batch: 250, refreshMs: 600_000, historyDays: 90, minContent: 0.10,
} as const;
export interface Vector { termIds: Int32Array; weights: Float32Array }
export const emptyVector = (): Vector => ({ termIds: new Int32Array(), weights: new Float32Array() });
export function counts(text: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const term of tokenize(text, { minLength: 2 }).tokens) result.set(term, (result.get(term) ?? 0) + 1);
  return result;
}
export function vectorize(terms: Map<string, number>, vocabulary: Map<string, number>, idf: Float64Array): Vector {
  const entries = [...terms].flatMap(([term, tf]) => {
    const id = vocabulary.get(term);
    return id === undefined ? [] : [[id, (1 + Math.log(tf)) * idf[id]!] as const];
  }).sort((a, b) => a[0] - b[0]);
  const length = Math.hypot(...entries.map((entry) => entry[1]));
  return { termIds: Int32Array.from(entries.map((entry) => entry[0])), weights: Float32Array.from(entries.map((entry) => length ? entry[1] / length : 0)) };
}
export function cosine(a: Vector, b: Vector): number {
  let i = 0, j = 0, sum = 0;
  while (i < a.termIds.length && j < b.termIds.length) {
    if (a.termIds[i] === b.termIds[j]) { sum += a.weights[i++]! * b.weights[j++]!; }
    else if (a.termIds[i]! < b.termIds[j]!) i++; else j++;
  }
  return Math.min(1, Math.max(0, sum));
}
export function matchLevel(title: string, description: string | null, query: string): number {
  const t = foldForMatch(title), s = foldForMatch(description ?? ''), q = foldForMatch(query);
  if (!q) return 0;
  if (t === q) return 5;
  if (` ${t} `.includes(` ${q} `)) return 4;
  if (t.startsWith(q) || t.includes(` ${q}`)) return 3;
  if (t.includes(q)) return 2;
  return s.includes(q) ? 1 : 0;
}
export function suggestionMatch(title: string, q: string): number {
  if (!q) return 0;
  return title.startsWith(q) ? 3 : title.includes(` ${q}`) ? 2 : title.includes(q) ? 1 : 0;
}
export const freshness = (createdAt: Date, now: Date): number => 0.5 ** (Math.max(0, now.getTime() - createdAt.getTime()) / 86_400_000 / 30);
export function newest(a: { createdAt: Date; id: string }, b: { createdAt: Date; id: string }): number {
  return b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id);
}
