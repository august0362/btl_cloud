import { queryString, request } from './client';
import type { DocumentDto } from './types';
export interface SettingsDto { personalizationEnabled: boolean; historyItems: number }
export interface SuggestionDto { documentId: string; title: string }
export interface RecommendationItemDto { document: DocumentDto; reason: 'SIMILAR_TO_HISTORY' | 'POPULAR' | 'NEW' }
export interface HomeRecommendations { strategy: 'PERSONALIZED' | 'POPULAR' | 'NEWEST'; items: RecommendationItemDto[] }
export const recommendationsApi = {
  home: (limit = 8, signal?: AbortSignal) => request<HomeRecommendations>('GET', `/api/recommendations/home${queryString({ limit })}`, { signal }),
  related: (id: string, limit = 6, signal?: AbortSignal) => request<{ items: DocumentDto[] }>('GET', `/api/documents/${id}/related${queryString({ limit })}`, { signal }),
  suggestions: (q: string, signal?: AbortSignal) => request<{ items: SuggestionDto[] }>('GET', `/api/recommendations/suggestions${queryString({ q })}`, { signal }),
  getSettings: (signal?: AbortSignal) => request<SettingsDto>('GET', '/api/recommendations/settings', { signal }),
  putSettings: (personalizationEnabled: boolean) => request<SettingsDto>('PUT', '/api/recommendations/settings', { body: { personalizationEnabled } }),
  deleteHistory: () => request<void>('DELETE', '/api/recommendations/history'),
};
