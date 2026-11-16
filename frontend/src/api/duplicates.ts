import type { DocumentDto, Visibility } from './types';
export interface DuplicateMatchDto { documentId: string; title: string; visibility: Visibility; ownedByYou: boolean; matchType: 'EXACT' | 'SAME_TEXT' | 'SIMILAR_TEXT'; similarity: number }
export interface DuplicateCheckDto { mode: 'off' | 'warn' | 'block'; result: 'ACCEPT' | 'WARNING'; exactMatches: DuplicateMatchDto[]; textMatches: DuplicateMatchDto[]; textAnalysis: { status: 'OK' | 'PARTIAL' | 'SKIPPED'; reason: string | null; candidatesScanned: number; candidatesTruncated: boolean } }
export type UploadResult = DocumentDto & { duplicateCheck: DuplicateCheckDto };
