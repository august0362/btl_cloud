import { setImmediate } from 'node:timers/promises';
import { foldForMatch } from '../../lib/text-normalize.js';
import type { Clock } from '../../lib/clock.js';
import type { Logger } from '../../lib/logger.js';
import type { CorpusRow, RecommendationRepository } from './recommendations.repository.js';
import { counts, RANKING_POLICY, vectorize, type Vector } from './ranking.policy.js';

export interface IndexedDocument extends Omit<CorpusRow, 'description'> { foldedTitle: string; vec: Vector; pop: number }
export interface RecommendationIndex { documents: IndexedDocument[]; byId: Map<string, IndexedDocument>; vocabulary: Map<string, number>; idf: Float64Array; builtAt: number }
export async function buildIndex(rows: CorpusRow[], popularity: Map<string, number>, now: number): Promise<RecommendationIndex> {
  const source = rows.slice(0, RANKING_POLICY.maxDocuments), frequencies = new Map<string, number>(), termCounts = [];
  for (let i = 0; i < source.length; i++) {
    const row = source[i]!;
    const terms = counts(`${row.title} ${row.title} ${row.description ?? ''}`);
    termCounts.push(terms);
    for (const term of terms.keys()) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    if ((i + 1) % RANKING_POLICY.batch === 0) await setImmediate();
  }
  const vocabulary = new Map([...frequencies.keys()].map((term, id) => [term, id]));
  const idf = Float64Array.from([...frequencies.values()].map((df) => Math.log((1 + source.length) / (1 + df)) + 1));
  const maxRaw = Math.max(0, ...source.map((row) => popularity.get(row.id) ?? 0));
  const documents: IndexedDocument[] = [];
  for (let i = 0; i < source.length; i++) {
    const { description: _description, ...row } = source[i]!;
    documents.push({ ...row, foldedTitle: foldForMatch(row.title), vec: vectorize(termCounts[i]!, vocabulary, idf), pop: maxRaw ? Math.log1p(popularity.get(row.id) ?? 0) / Math.log1p(maxRaw) : 0 });
    if ((i + 1) % RANKING_POLICY.batch === 0) await setImmediate();
  }
  return { documents, byId: new Map(documents.map((doc) => [doc.id, doc])), vocabulary, idf, builtAt: now };
}
export class IndexManager {
  private index: RecommendationIndex | undefined;
  private building: Promise<void> | undefined;
  constructor(private readonly repository: RecommendationRepository, private readonly clock: Clock, private readonly logger: Logger) {}
  get(): RecommendationIndex | undefined {
    if (!this.index || this.clock.now().getTime() - this.index.builtAt >= RANKING_POLICY.refreshMs) void this.refresh();
    return this.index;
  }
  refresh(): Promise<void> {
    if (this.building) return this.building;
    this.building = this.build().finally(() => { this.building = undefined; });
    return this.building;
  }
  private async build(): Promise<void> {
    const started = performance.now(), now = this.clock.now();
    try {
      const [rows, popularity] = await Promise.all([this.repository.corpus(), this.repository.popularity(new Date(now.getTime() - 30 * 86_400_000))]);
      this.index = await buildIndex(rows, new Map(popularity.map((row) => [row.documentId, Number(row.raw)])), now.getTime());
      this.logger.info({ event: 'recommendations.index_built', documents: this.index.documents.length, terms: this.index.vocabulary.size, durationMs: performance.now() - started }, 'Chỉ mục gợi ý sẵn sàng');
    } catch { this.logger.warn({ event: 'recommendations.index_failed' }, 'Không dựng được chỉ mục gợi ý'); }
  }
}
