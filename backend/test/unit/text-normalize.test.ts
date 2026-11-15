import { describe, expect, it } from 'vitest';
import { foldForMatch, normalizeText, tokenize } from '../../src/lib/text-normalize.js';

describe('shared text normalization', () => {
  it('normalizes compatibility characters and punctuation while preserving accents', () => {
    expect(normalizeText('  ＡＢＣ, BÀN/bản—bạn! 123 ')).toBe('abc bàn bản bạn 123');
    expect(normalizeText('a\u0301')).toBe('á');
    expect(tokenize('bàn bản bạn').tokens).toEqual(['bàn', 'bản', 'bạn']);
  });
  it('uses code points for length and reports truncation only when another accepted token exists', () => {
    expect(tokenize('a 𐐀 hello', { minLength: 2 })).toEqual({ tokens: ['hello'], truncated: false });
    expect(tokenize('a b', { maxTokens: 2 })).toEqual({ tokens: ['a', 'b'], truncated: false });
    expect(tokenize('a b c', { maxTokens: 2 })).toEqual({ tokens: ['a', 'b'], truncated: true });
    expect(tokenize('', { maxTokens: 0 })).toEqual({ tokens: [], truncated: false });
  });
  it('folds accents and đ for matching only', () => {
    expect(foldForMatch('ĐỀ CƯƠNG tiếng Việt')).toBe('de cuong tieng viet');
  });
});
