import { describe, it, expect } from 'vitest';
import { parseQuery, parseLocalRef, matchBooks } from '../../src/lib/data/find';
import { BOOKS } from '../../src/lib/pipeline/books';

const all = new Set(BOOKS.map((b) => b.id));
const noNative = () => undefined;

describe('search: books and references', () => {
  it('splits a book name from chapter and verse', () => {
    expect(parseQuery('1 John 3:16')).toEqual({ name: '1 John', c: 3, v: 16 });
    expect(parseQuery('rom 8')).toEqual({ name: 'rom', c: 8, v: undefined });
    expect(parseQuery('phm 1.10')).toEqual({ name: 'phm', c: 1, v: 10 });
    expect(parseQuery('3 John')).toEqual({ name: '3 John' });
    expect(parseQuery('பிலேமோன் 1:10')).toEqual({ name: 'பிலேமோன்', c: 1, v: 10 });
  });

  it('reads a bare reference inside the open book', () => {
    expect(parseLocalRef('3:16')).toBe('3:16');
    expect(parseLocalRef('4')).toBe('4:1');
    expect(parseLocalRef('love')).toBeUndefined();
  });

  it('finds books by code, English or Tamil name, best match first', () => {
    expect(matchBooks('John', all, noNative)[0].id).toBe('JHN');
    expect(matchBooks('1 John 3:16', all, noNative)[0]).toEqual({ id: '1JN', ref: '3:16' });
    expect(matchBooks('phm 1:10', all, noNative)[0]).toEqual({ id: 'PHM', ref: '1:10' });
    expect(matchBooks('பிலே', all, noNative)[0].id).toBe('PHM');
    expect(matchBooks('Romans 3', all, noNative)[0]).toEqual({ id: 'ROM', ref: '3:1' });
  });

  it('only offers available books and chapters that exist', () => {
    expect(matchBooks('John', new Set(['1JN']), noNative).map((m) => m.id)).toEqual(['1JN']);
    expect(matchBooks('phm 2', all, noNative)).toEqual([]);
    expect(matchBooks('G5547', all, noNative)).toEqual([]);
  });
});
