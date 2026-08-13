import { describe, expect, it } from 'vitest';
import { countHan, extractHan, isHan } from '../../src/utils/text';

describe('Han text utilities', () => {
  it('recognizes common, compatibility, and extension-plane Han characters', () => {
    expect(isHan('学')).toBe(true);
    expect(isHan('神')).toBe(true);
    expect(isHan('𠀀')).toBe(true);
    expect(extractHan('A学𠀀，1')).toEqual(['学', '𠀀']);
    expect(countHan('A学𠀀，1')).toBe(2);
  });
});
