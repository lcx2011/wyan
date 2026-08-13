import { expect, it } from 'vitest';
import { sentenceId, memberId, sha256, sha256Sync } from '../../src/domain/content/identity';

it('pure-js sha256Sync matches the FIPS-180-4 test vector', () => {
  expect(sha256Sync('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(sha256Sync('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

it('sha256Sync matches crypto.subtle output for representative inputs', async () => {
  const cases = [
    '',
    'a',
    'abc',
    '永遇乐·京口北固亭怀古',
    'online:268d6d4\u0000千古江山，英雄无觅孙仲谋处。\u00000',
    'a'.repeat(1000),
    '你好世界'.repeat(200),
  ];
  for (const value of cases) {
    expect(sha256Sync(value)).toBe(await sha256(value));
  }
});

it('sentenceId / memberId stay stable across hash backends', async () => {
  // 手动构造一个与 sentenceId 同输入的 fallback 输出，验证 sha256 有 fallback 时结果一致
  const sentenceInput = 'online:u1\u0000静夜思，床前明月光。\u00000';
  expect(await sentenceId('online:u1', '静夜思，床前明月光。', 0)).toBe(sha256Sync(sentenceInput));
  const member = await memberId(['m1', 'm2']);
  expect(member).toBe(sha256Sync('m1\u0000m2'));
  expect(member).toMatch(/^[0-9a-f]{64}$/);
});
