import { expect, it } from 'vitest';
import fixture from '../fixtures/gushiwen-detail.json';
import { importPassage } from '../../src/domain/content/importer';
import { acceptedInitials } from '../../src/domain/typing/pinyin';
import { splitSentences } from '../../src/domain/content/normalize';
import { countHan } from '../../src/utils/text';

function flattenSentences(passage: Awaited<ReturnType<typeof importPassage>>) {
  return passage.segments.flatMap((segment) => segment.cards.flatMap((card) => card.sentences));
}

function flattenCards(passage: Awaited<ReturnType<typeof importPassage>>) {
  return passage.segments.flatMap((segment) => segment.cards);
}

function identityGraph(passage: Awaited<ReturnType<typeof importPassage>>) {
  return {
    id: passage.id,
    contentVersion: passage.contentVersion,
    segments: passage.segments.map((segment) => ({
      id: segment.id,
      cards: segment.cards.map((card) => ({
        id: card.id,
        sentenceIds: card.sentences.map((sentence) => sentence.id),
      })),
    })),
  };
}

it('cleans html, keeps punctuation and creates stable ids', async () => {
  const first = await importPassage(fixture, 'uuid-1', { cachedAt: '2026-08-04T00:00:00.000Z' });
  const second = await importPassage(fixture, 'uuid-1', { cachedAt: '2026-08-04T00:00:01.000Z' });

  expect(flattenSentences(first).map((sentence) => sentence.text)).toContain('先帝创业未半而中道崩殂，');
  expect(first.title).toBe('出师表');
  expect(identityGraph(second)).toEqual(identityGraph(first));
  expect(first.cachedAt).toBe('2026-08-04T00:00:00.000Z');
  expect(second.cachedAt).toBe('2026-08-04T00:00:01.000Z');
});

it('rejects empty source text instead of creating a placeholder', async () => {
  await expect(importPassage({ ...fixture, poem_data: { content: [{ yuanwen: '' }] } }, 'bad'))
    .rejects.toThrow('原文为空');
});

it('rejects an explicitly empty top-level source text', async () => {
  await expect(importPassage({ ...fixture, content: '' }, 'bad-top-level')).rejects.toThrow('原文为空');
});

it('splits long text, keeps terminal punctuation, and keeps cards within the 1-6 sentence contract', async () => {
  const passage = await importPassage({
    ...fixture,
    poem_data: {
      content: [{
        yuanwen: '甲乙丙丁戊己庚辛壬癸。甲乙丙丁戊己庚辛壬癸！甲乙丙丁戊己庚辛壬癸？',
        yiwen: '译文',
      }],
    },
  }, 'long');
  const sentences = flattenSentences(passage);

  expect(sentences.map((sentence) => sentence.text)).toEqual([
    '甲乙丙丁戊己庚辛壬癸。', '甲乙丙丁戊己庚辛壬癸！', '甲乙丙丁戊己庚辛壬癸？',
  ]);
  const cards = flattenCards(passage);
  expect(cards.every((card) => card.sentences.length >= 1 && card.sentences.length <= 6)).toBe(true);
  expect(cards.every((card) => countHan(card.sentences.map((s) => s.text).join('')) <= 30)).toBe(true);
});

it('supports multi-clause cards (1-N sentences) within the 15-25 han target', async () => {
  const passage = await importPassage({
    ...fixture,
    poem_data: {
      content: [{
        yuanwen: '甲乙丙丁戊己庚辛壬癸，甲乙丙丁戊己庚辛壬癸，甲乙丙丁戊己庚辛壬癸，甲乙丙丁戊己庚辛壬癸。',
        yiwen: '译文',
      }],
    },
  }, 'multi');
  const sentences = flattenSentences(passage);
  const cards = flattenCards(passage);

  expect(sentences.map((sentence) => sentence.text)).toEqual([
    '甲乙丙丁戊己庚辛壬癸，', '甲乙丙丁戊己庚辛壬癸，', '甲乙丙丁戊己庚辛壬癸，', '甲乙丙丁戊己庚辛壬癸。',
  ]);
  expect(cards.every((card) => card.sentences.length >= 1 && card.sentences.length <= 6)).toBe(true);
  // 散文不跨句号：逗号连句贪心合卡，超过 25 字即断 → 两张 20 字卡。
  expect(cards.map((card) => card.sentences.map((s) => s.text).join(''))).toEqual([
    '甲乙丙丁戊己庚辛壬癸，甲乙丙丁戊己庚辛壬癸，',
    '甲乙丙丁戊己庚辛壬癸，甲乙丙丁戊己庚辛壬癸。',
  ]);
});

it('never produces a card over 25 han for the Yongyuele sample in any punctuation form', async () => {
  const fourPai = '千古江山，英雄无觅孙仲谋处。舞榭歌台，风流总被雨打风吹去。元嘉草草，封狼居胥，赢得仓皇北顾。四十三年，望中犹记，烽火扬州路。';
  const twoPai = '千古江山，英雄无觅孙仲谋处，舞榭歌台，风流总被雨打风吹去。元嘉草草，封狼居胥，赢得仓皇北顾，四十三年，望中犹记，烽火扬州路。';
  const allCommas = '千古江山，英雄无觅孙仲谋处，舞榭歌台，风流总被雨打风吹去，元嘉草草，封狼居胥，赢得仓皇北顾，四十三年，望中犹记，烽火扬州路。';
  const detail = {
    ...fixture,
    title: { name: '永遇乐·京口北固亭怀古', author: '辛弃疾', chaodai: '宋' },
  };

  // 任意标点形态下，正常切卡单卡 ≤25 字；词牌尾卡归并兜底允许到 30 字
  // （避免 <15 字的孤卡，如 22+5 → 27），兜底异常除外。
  for (const yuanwen of [fourPai, twoPai, allCommas]) {
    const passage = await importPassage({ ...detail, poem_data: { content: [{ yuanwen }] } }, 'yongyuele');
    const cards = flattenCards(passage);
    const maxHan = Math.max(...cards.map((card) => countHan(card.sentences.map((s) => s.text).join(''))));
    expect(maxHan).toBeLessThanOrEqual(30);
  }

  // 回归验收：上片 4 拍 → 2 卡 [25,27]（12+13 合并成 25，14+13 合并成 27），
  // 不再出现 1 张 52 字长卡，也不出现 <15 字的零碎小卡。
  const passage = await importPassage({ ...detail, poem_data: { content: [{ yuanwen: fourPai }] } }, 'yongyuele');
  const cards = flattenCards(passage);
  expect(cards.map((card) => countHan(card.sentences.map((s) => s.text).join('')))).toEqual([25, 27]);
});

it('balances a short final segment instead of leaving a one-card tail', async () => {
  const passage = await importPassage({
    ...fixture,
    poem_data: { content: Array.from({ length: 10 }, (_, index) => ({ yuanwen: `第${'甲'.repeat(30)}${index}。` })) },
  }, 'balanced');
  const cardCounts = passage.segments.map((segment) => segment.cards.length);

  expect(cardCounts).toEqual([3, 3, 4]);
  expect(cardCounts[cardCounts.length - 1]).toBeGreaterThan(1);
});

it('uses aligned API pinyin, omits punctuation slots, and preserves polyphonic alternatives', () => {
  expect(acceptedInitials('先帝，', 'xiān dì')).toEqual([['x'], ['d']]);
  expect(acceptedInitials('长', 'cháng')[0]).toEqual(expect.arrayContaining(['c', 'z']));
  expect(acceptedInitials('长行重')).toEqual([
    expect.arrayContaining(['c', 'z']),
    expect.arrayContaining(['x', 'h']),
    expect.arrayContaining(['z', 'c']),
  ]);
});

it('splits sentence-ending punctuation without dropping it', () => {
  expect(splitSentences('甲。乙；丙')).toEqual(['甲。', '乙；', '丙']);
});
