import type { Clock } from '../../lib/clock.js';
import type { Logger } from '../../lib/logger.js';
import { foldForMatch } from '../../lib/text-normalize.js';
import { toDocumentDto, toPageDto } from '../documents/document.mapper.js';
import type { DocumentRepository, DocumentWithOwner } from '../documents/document.repository.js';
import type { PublicQuery } from '../documents/documents.schemas.js';
import { IndexManager, type RecommendationIndex } from './recommendations.index.js';
import { RecommendationRepository } from './recommendations.repository.js';
import { cosine, counts, emptyVector, freshness, matchLevel, newest, RANKING_POLICY as P, suggestionMatch, vectorize } from './ranking.policy.js';

type Reason = 'SIMILAR_TO_HISTORY' | 'POPULAR' | 'NEW';
export class RecommendationService {
  readonly index: IndexManager;
  constructor(readonly repository: RecommendationRepository, private readonly documents: DocumentRepository, private readonly enabled: boolean, private readonly clock: Clock, private readonly logger: Logger) {
    this.index = new IndexManager(repository, clock, logger);
  }
  get isEnabled(): boolean { return this.enabled; }
  now(): Date { return this.clock.now(); }
  writeFailed(): void { this.logger.warn({ event: 'interactions.write_failed' }, 'Không ghi được tương tác'); }
  private fallback(surface: string, reason: string): void { this.logger.warn({ event: 'recommendations.fallback', surface, reason }, 'Dùng thứ tự dự phòng'); }
  private async profile(userId: string | undefined, index: RecommendationIndex | undefined, allExclusions = false) {
    const excluded = new Set<string>(), weights = new Map<number, number>();
    if (!userId || !index) return { vector: emptyVector(), excluded };
    try {
      const since = new Date(this.clock.now().getTime() - P.historyDays * 86_400_000);
      const [history, interacted] = await Promise.all([this.repository.history(userId, since), allExclusions ? this.repository.interactedIds(userId, since) : Promise.resolve([])]);
      for (const row of interacted) excluded.add(row.documentId);
      for (const row of history) {
        excluded.add(row.documentId);
        const doc = index.byId.get(row.documentId);
        if (!doc) continue;
        const weight = (row.kind === 'DOWNLOAD' ? 2 : 1) * freshness(row.lastAt, this.clock.now());
        for (let i = 0; i < doc.vec.termIds.length; i++) {
          const id = doc.vec.termIds[i]!;
          weights.set(id, (weights.get(id) ?? 0) + weight * doc.vec.weights[i]!);
        }
      }
    } catch { this.fallback('history', 'read_failed'); }
    const top = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 100).sort((a, b) => a[0] - b[0]);
    const norm = Math.hypot(...top.map((row) => row[1]));
    return { excluded, vector: { termIds: Int32Array.from(top.map((row) => row[0])), weights: Float32Array.from(top.map((row) => norm ? row[1] / norm : 0)) } };
  }
  async home(limit: number, userId?: string) {
    try { return await this.homeRanked(limit, userId); }
    catch { this.fallback('home', 'ranking_failed'); return this.newestHome(limit, userId); }
  }
  private async newestHome(limit: number, userId?: string) {
    const result = await this.documents.search({ scope: { kind: 'public' }, sort: 'newest', page: 1, pageSize: 100 });
    const rows = await this.documents.findDiscoverableByIds(result.rows.filter((doc) => doc.ownerId !== userId).slice(0, limit).map((doc) => doc.id));
    return { strategy: 'NEWEST' as const, items: rows.map((row) => ({ document: toDocumentDto(row, userId), reason: 'NEW' as Reason })) };
  }
  private async homeRanked(limit: number, userId?: string) {
    const index = this.enabled ? this.index.get() : undefined;
    if (!index) {
      return this.newestHome(limit, userId);
    }
    const { vector, excluded } = await this.profile(userId, index, true);
    const personalized = vector.termIds.length > 0;
    const strategy = personalized ? 'PERSONALIZED' : index.documents.some((doc) => doc.pop > 0) ? 'POPULAR' : 'NEWEST';
    const ranked = index.documents.filter((doc) => doc.ownerId !== userId && (!personalized || !excluded.has(doc.id))).map((doc) => {
      const components: [Reason, number][] = personalized
        ? [['SIMILAR_TO_HISTORY', P.home.pref * cosine(vector, doc.vec)], ['POPULAR', P.home.pop * doc.pop], ['NEW', P.home.fresh * freshness(doc.createdAt, this.clock.now())]]
        : [['POPULAR', P.cold.pop * doc.pop], ['NEW', P.cold.fresh * freshness(doc.createdAt, this.clock.now())]];
      return { doc, score: components.reduce((sum, entry) => sum + entry[1], 0), reason: components.sort((a, b) => b[1] - a[1])[0]![0] };
    }).sort((a, b) => b.score - a.score || newest(a.doc, b.doc)).slice(0, limit * 2);
    const rows = await this.documents.findDiscoverableByIds(ranked.map((item) => item.doc.id));
    const reasons = new Map(ranked.map((item) => [item.doc.id, item.reason]));
    return { strategy, items: rows.slice(0, limit).map((row) => ({ document: toDocumentDto(row, userId), reason: strategy === 'NEWEST' ? 'NEW' : reasons.get(row.id)! })) };
  }
  async related(source: DocumentWithOwner, limit: number, userId?: string) {
    try { return await this.relatedRanked(source, limit, userId); }
    catch { this.fallback('related', 'ranking_failed'); return { items: [] }; }
  }
  private async relatedRanked(source: DocumentWithOwner, limit: number, userId?: string) {
    const index = this.enabled ? this.index.get() : undefined;
    if (!index) return { items: [] };
    const vector = index.byId.get(source.id)?.vec ?? vectorize(counts(`${source.title} ${source.title} ${source.description ?? ''}`), index.vocabulary, index.idf);
    const ranked = index.documents.filter((doc) => doc.id !== source.id).map((doc) => ({ doc, content: cosine(vector, doc.vec) })).filter((row) => row.content >= P.minContent).map((row) => ({ ...row, score: P.related.content * row.content + P.related.pop * row.doc.pop + P.related.fresh * freshness(row.doc.createdAt, this.clock.now()) })).sort((a, b) => b.score - a.score || newest(a.doc, b.doc)).slice(0, limit * 2);
    const rows = await this.documents.findDiscoverableByIds(ranked.map((row) => row.doc.id));
    return { items: rows.slice(0, limit).map((row) => toDocumentDto(row, userId)) };
  }
  async suggestions(query: string) {
    try { return await this.suggestionsRanked(query); }
    catch { this.fallback('suggestions', 'ranking_failed'); return { items: [] }; }
  }
  private async suggestionsRanked(query: string) {
    if ([...query].length < 2) return { items: [] };
    const index = this.enabled ? this.index.get() : undefined;
    if (!index) return { items: [] };
    const q = foldForMatch(query), seen = new Set<string>();
    const ranked = index.documents.map((doc) => ({ doc, match: suggestionMatch(doc.foldedTitle, q) })).filter((row) => row.match > 0).sort((a, b) => b.match - a.match || b.doc.pop - a.doc.pop || newest(a.doc, b.doc)).filter(({ doc }) => { if (seen.has(doc.foldedTitle)) return false; seen.add(doc.foldedTitle); return true; }).slice(0, 16);
    const rows = await this.documents.findDiscoverableByIds(ranked.map((row) => row.doc.id));
    const currentTitles = new Set<string>();
    return { items: rows.filter((row) => { const title = foldForMatch(row.title); if (currentTitles.has(title)) return false; currentTitles.add(title); return true; }).slice(0, 8).map((row) => ({ documentId: row.id, title: row.title })) };
  }
  async search(query: PublicQuery, userId?: string) {
    const q = query.q ?? '', offset = (query.page - 1) * query.pageSize;
    const raw = (start: number, limit: number) => this.documents.searchRelevanceOrdered({ q, fileType: query.fileType, offset: start, limit });
    const first = await raw(0, 200);
    let ids: string[];
    try {
      if (!this.enabled) throw new Error('disabled');
      const index = this.index.get(), { vector } = await this.profile(userId, index);
      const ranked = first.rows.map((doc) => ({ doc, level: matchLevel(doc.title, doc.description, q), score: P.search.pref * (index?.byId.get(doc.id) ? cosine(vector, index.byId.get(doc.id)!.vec) : 0) + P.search.pop * (index?.byId.get(doc.id)?.pop ?? 0) + P.search.fresh * freshness(doc.createdAt, this.clock.now()) })).sort((a, b) => b.level - a.level || b.score - a.score || newest(a.doc, b.doc));
      ids = ranked.slice(offset, offset + query.pageSize).map((row) => row.doc.id);
      if (offset + query.pageSize > 200 && first.total > 200) ids.push(...(await raw(Math.max(offset, 200), offset >= 200 ? query.pageSize : offset + query.pageSize - 200)).rows.map((row) => row.id));
    } catch {
      this.fallback('search', this.enabled ? 'ranking_failed' : 'disabled');
      ids = (await raw(offset, query.pageSize)).rows.map((row) => row.id);
    }
    const rows = await this.documents.findDiscoverableByIds(ids);
    return toPageDto(rows.map((row) => toDocumentDto(row, userId)), query.page, query.pageSize, first.total);
  }
  async purge(): Promise<void> {
    if (!this.enabled) return;
    try {
      let count, total = 0;
      do { count = await this.repository.purge(new Date(this.clock.now().getTime() - P.historyDays * 86_400_000)); total += count; } while (count === 10000);
      this.logger.info({ event: 'interactions.purged', deleted: total }, 'Dọn lịch sử quá hạn');
    } catch { this.logger.warn({ event: 'interactions.write_failed' }, 'Không dọn được lịch sử quá hạn'); }
  }
  start(): () => void {
    if (!this.enabled) return () => {};
    const refresh = setInterval(() => { void this.index.refresh(); }, P.refreshMs);
    const purge = setInterval(() => { void this.purge(); }, 86_400_000);
    refresh.unref(); purge.unref();
    return () => { clearInterval(refresh); clearInterval(purge); };
  }
}
