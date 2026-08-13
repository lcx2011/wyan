import { expect, it } from 'vitest';
import type { Passage } from '../../src/types';

it('accepts the formal passage schema', () => {
  const passage: Passage = {
    id: 'builtin:demo', sourceType: 'builtin', sourceId: 'demo',
    contentVersion: 'sha256:x', title: '示例', author: '佚名', dynasty: '未知',
    cachedAt: '2026-08-04T00:00:00.000Z',
    segments: [{ id: 'seg:x', index: 0, cards: [{ id: 'card:x', sentences: [
      { id: 'sentence:x', text: '学而时习之。', meaning: '', acceptedInitials: [['x'],['e'],['s'],['x'],['z']] }
    ] }] }]
  };

  expect(passage.segments[0].cards[0].sentences[0].id).toBe('sentence:x');
});
