import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '../../src/lib/logger.js';
import type { DocumentRepository } from '../../src/modules/documents/document.repository.js';
import type { RecommendationRepository } from '../../src/modules/recommendations/recommendations.repository.js';
import { RecommendationService } from '../../src/modules/recommendations/recommendations.service.js';

describe('relevance search query budget', () => {
  it.each([{ enabled: false, page: 1 }, { enabled: true, page: 5 }])('does not load an unused ranking prefix: %j', async ({ enabled, page }) => {
    const documents = {
      searchRelevanceOrdered: vi.fn().mockResolvedValue({ total: 240, rows: [{ id: 'now-private' }] }),
      findDiscoverableByIds: vi.fn().mockResolvedValue([]),
    };
    const repository = { corpus: vi.fn(), popularity: vi.fn(), history: vi.fn() };
    const logger = { warn: vi.fn() };
    const service = new RecommendationService(repository as unknown as RecommendationRepository, documents as unknown as DocumentRepository, enabled, { now: () => new Date(0) }, logger as unknown as Logger);
    const result = await service.search({ q: 'AWS', sort: 'relevance', page, pageSize: 50 }, 'viewer');
    expect(documents.searchRelevanceOrdered).toHaveBeenCalledExactlyOnceWith({ q: 'AWS', fileType: undefined, offset: (page - 1) * 50, limit: 50 });
    expect(repository.corpus).not.toHaveBeenCalled();
    expect(repository.history).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(documents.findDiscoverableByIds).toHaveBeenCalledWith(['now-private']);
    expect(result).toMatchObject({ items: [], totalItems: 240, page });
  });
});
