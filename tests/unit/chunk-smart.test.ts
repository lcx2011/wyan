import { describe, expect, it, vi } from 'vitest';
import { detectGenre } from '../../src/domain/content/genre';
import {
  normalizeText,
  normalizeTextPreservingLines,
  splitClauses,
  splitSentences,
} from '../../src/domain/content/normalize';
import { chunkCardsV2 } from '../../src/domain/content/chunk';
import {
  migrateRechunkedProgress,
  rechunkPassageIfNeeded,
} from '../../src/domain/content/rechunkMigration';
import type { Passage, PassageProgress, Sentence } from '../../src/types';
import { countHan } from '../../src/utils/text';

function sentence(text: string): Sentence {
  return { id: `s:${text}`, text, meaning: '', acceptedInitials: [] };
}

function buildPassage(id: string, cards: string[][], contentVersion = `v:${id}`): Passage {
  return {
    id,
    sourceType: 'online',
    sourceId: id,
    contentVersion,
    title: id,
    author: '',
    dynasty: '',
    cachedAt: '2026-08-04T00:00:00.000Z',
    segments: [{
      id: `${id}:seg:0`,
      index: 0,
      cards: cards.map((cardTexts, cardIndex) => ({
        id: `${id}:seg:0:card:${cardIndex}`,
        sentences: cardTexts.map((text) => sentence(text)),
      })),
    }],
  };
}

function defaultProgress(): PassageProgress {
  return {
    cursor: null,
    currentSegment: 0,
    currentCardIndex: 0,
    cardMastery: {},
    sentenceStates: {},
    cardBlindPassed: {},
    linkSnowballPassed: {},
    segmentSnowballPassed: {},
    snowballPassed: [],
    fullTextCompleted: false,
    fullTextPassed: false,
    lastAttemptTime: null,
    bestPassedTime: null,
    bestTime: 0,
    updatedAt: '2026-08-04T00:00:00.000Z',
  };
}

describe('normalizeText 行信号保留', () => {
  it('默认折叠换行，preserveLines 变体保留行信号', () => {
    expect(normalizeText(' 甲\n乙 ')).toBe('甲 乙');
    expect(normalizeTextPreservingLines(' 甲\n\n乙 ')).toBe('甲\n乙');
    expect(normalizeTextPreservingLines('<span>床前明月光</span>\n疑是地上霜')).toBe('床前明月光\n疑是地上霜');
  });
});

describe('detectGenre 体裁检测', () => {
  it('五言诗：\\n 行每行 5 字', () => {
    expect(detectGenre('床前明月光\n疑是地上霜\n举头望明月\n低头思故乡')).toBe('poem');
  });

  it('五言绝句无换行：分句长度全部恒为 5', () => {
    expect(detectGenre('床前明月光，疑是地上霜。举头望明月，低头思故乡。')).toBe('poem');
  });

  it('词：标题含词牌名优先判定', () => {
    expect(detectGenre(
      '千古江山，英雄无觅孙仲谋处。舞榭歌台，风流总被雨打风吹去。',
      [],
      '永遇乐·京口北固亭怀古',
    )).toBe('ci');
  });

  it('词：分句长度集中在 3–9 字且节奏整齐', () => {
    expect(detectGenre(
      '千古江山，英雄无觅孙仲谋处。舞榭歌台，风流总被雨打风吹去。元嘉草草，封狼居胥，赢得仓皇北顾。四十三年，望中犹记，烽火扬州路。',
    )).toBe('ci');
  });

  it('散文：分句长度分布离散', () => {
    expect(detectGenre(
      '先帝创业未半而中道崩殂，今天下三分，益州疲弊，此诚危急存亡之秋也。然侍卫之臣不懈于内，忠志之士忘身于外者，盖追先帝之殊遇，欲报之于陛下也。',
    )).toBe('prose');
  });
});

describe('splitSentences / splitClauses 分句增强', () => {
  it('splitClauses 在逗号/顿号/句号全分句且保留标点', () => {
    expect(splitClauses('甲，乙、丙。丁；戊')).toEqual(['甲，', '乙、', '丙。', '丁；', '戊']);
  });

  it('auto 模式保持旧句号级兼容', () => {
    expect(splitSentences('甲。乙；丙')).toEqual(['甲。', '乙；', '丙']);
  });

  it('散文超长句（>25 字）在逗号处二次切分', () => {
    expect(splitSentences(
      '甲乙丙丁戊己庚辛壬癸甲乙丙丁戊己庚辛壬癸，甲乙丙丁戊己庚辛壬癸甲乙丙丁戊己庚辛壬癸。',
      { mode: 'sentence' },
    )).toEqual([
      '甲乙丙丁戊己庚辛壬癸甲乙丙丁戊己庚辛壬癸，',
      '甲乙丙丁戊己庚辛壬癸甲乙丙丁戊己庚辛壬癸。',
    ]);
  });
});

describe('chunkCardsV2 区间与语义边界', () => {
  it('五言绝句：1 卡 20 字（2 联）', () => {
    const clauses = ['床前明月光，', '疑是地上霜。', '举头望明月，', '低头思故乡。'].map(sentence);
    const cards = chunkCardsV2(clauses, { genre: 'poem' });
    expect(cards.map((card) => card.length)).toEqual([4]);
    expect(countHan(cards[0].map((clause) => clause.text).join(''))).toBe(20);
  });

  it('七言律诗：按对仗联切卡（14/14/14），不跨联', () => {
    const clauses = [
      '山重水复疑无路，', '柳暗花明又一村。', '箫鼓追随春社近，', '衣冠简朴古风存。',
      '从今若许闲乘月，', '拄杖无时夜叩门。',
    ].map(sentence);
    const cards = chunkCardsV2(clauses, { genre: 'poem' });
    expect(cards.map((card) => card.length)).toEqual([2, 2, 2]);
    expect(cards.map((card) => countHan(card.map((clause) => clause.text).join('')))).toEqual([14, 14, 14]);
  });

  it('词：上片 4 拍 → 2 卡 [25,27]（12+13 合并成 25，14+13 合并成 27，不跨拍）', () => {
    const clauses = splitClauses(
      '千古江山，英雄无觅孙仲谋处。舞榭歌台，风流总被雨打风吹去。元嘉草草，封狼居胥，赢得仓皇北顾。四十三年，望中犹记，烽火扬州路。',
    ).map(sentence);
    const cards = chunkCardsV2(clauses, { genre: 'ci' });
    expect(cards.map((card) => countHan(card.map((clause) => clause.text).join('')))).toEqual([25, 27]);
    expect(cards.every((card) => countHan(card.map((clause) => clause.text).join('')) <= 30)).toBe(true);
  });

  it('词：半阕句号形态 2 拍（25/27）各成 1 卡，不跨拍', () => {
    const clauses = splitClauses(
      '千古江山，英雄无觅孙仲谋处，舞榭歌台，风流总被雨打风吹去。元嘉草草，封狼居胥，赢得仓皇北顾，四十三年，望中犹记，烽火扬州路。',
    ).map(sentence);
    const cards = chunkCardsV2(clauses, { genre: 'ci' });
    expect(cards.map((card) => countHan(card.map((clause) => clause.text).join('')))).toEqual([25, 27]);
  });

  it('词：V3 全逗号形态无拍界 → 拍内强制切卡，单卡 ≤30', () => {
    const clauses = splitClauses(
      '千古江山，英雄无觅孙仲谋处，舞榭歌台，风流总被雨打风吹去，元嘉草草，封狼居胥，赢得仓皇北顾，四十三年，望中犹记，烽火扬州路。',
    ).map(sentence);
    const cards = chunkCardsV2(clauses, { genre: 'ci' });
    expect(cards.every((card) => countHan(card.map((clause) => clause.text).join('')) <= 30)).toBe(true);
    // 拍内按分句切分，每张卡都在逗号分句边界处断开
    expect(cards.flatMap((card) => card).map((clause) => clause.text)).toEqual(
      splitClauses('千古江山，英雄无觅孙仲谋处，舞榭歌台，风流总被雨打风吹去，元嘉草草，封狼居胥，赢得仓皇北顾，四十三年，望中犹记，烽火扬州路。'),
    );
  });

  it('词：相邻小拍合计 ≤24 字时合并为 1 卡', () => {
    const clauses = ['甲甲甲甲甲。', '甲甲甲甲甲。', '甲甲甲甲甲。'].map(sentence);
    const cards = chunkCardsV2(clauses, { genre: 'ci' });
    expect(cards.map((card) => countHan(card.map((clause) => clause.text).join('')))).toEqual([15]);
  });

  it('散文：不跨句号级标点', () => {
    const clauses = ['甲。', '乙。', '丙，', '丁，'].map(sentence);
    const cards = chunkCardsV2(clauses, { genre: 'prose' });
    expect(cards.map((card) => card.map((clause) => clause.text))).toEqual([
      ['甲。'],
      ['乙。'],
      ['丙，', '丁，'],
    ]);
  });

  it('超过 maxHan 强制切卡', () => {
    const clauses = ['甲'.repeat(20) + '，', '甲'.repeat(20) + '，', '甲'.repeat(20) + '。'].map(sentence);
    const cards = chunkCardsV2(clauses, { genre: 'ci' });
    expect(cards.map((card) => countHan(card.map((clause) => clause.text).join('')))).toEqual([20, 20, 20]);
  });

  it('单分句超过 maxHan 兜底单句成卡并打日志', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const cards = chunkCardsV2(['甲'.repeat(40) + '。'].map(sentence), { genre: 'ci' });
      expect(cards).toHaveLength(1);
      expect(countHan(cards[0][0].text)).toBe(40);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('卡内分句数不超过 maxSentences（6）', () => {
    const clauses = Array.from({ length: 10 }, () => sentence('丙丙丙，'));
    const cards = chunkCardsV2(clauses, { genre: 'ci' });
    expect(cards.map((card) => card.length)).toEqual([6, 4]);
  });
});

describe('rechunkMigration 存量迁移', () => {
  it('旧大句 → 新分句：phase 以 max 继承，cursor 映射到新分句，篇目级状态保留', () => {
    const oldPassage = buildPassage('online:x', [
      ['千古江山，英雄无觅孙仲谋处。', '舞榭歌台，风流总被雨打风吹去。'],
    ], 'v1');
    const newPassage = buildPassage('online:x', [
      ['千古江山，', '英雄无觅孙仲谋处。'],
      ['舞榭歌台，', '风流总被雨打风吹去。'],
    ], 'v2');

    const oldCard = oldPassage.segments[0].cards[0];
    const oldProgress: PassageProgress = {
      ...defaultProgress(),
      cursor: {
        passageId: oldPassage.id,
        segmentId: oldPassage.segments[0].id,
        cardId: oldCard.id,
        sentenceId: oldCard.sentences[1].id,
      },
      sentenceStates: {
        [oldCard.sentences[0].id]: { phase: 3, passed: true },
        [oldCard.sentences[1].id]: { phase: 2, passed: true },
      },
      cardBlindPassed: { [oldCard.id]: true },
      linkSnowballPassed: { 'link:1': true },
      segmentSnowballPassed: { [oldPassage.segments[0].id]: true },
      snowballPassed: [true, false],
      fullTextCompleted: true,
      fullTextPassed: true,
      lastAttemptTime: '2026-08-04T00:00:00.000Z',
      bestPassedTime: 12000,
      bestTime: 12000,
    };

    const migrated = migrateRechunkedProgress(oldPassage, newPassage, oldProgress);
    const newFlat = newPassage.segments.flatMap((segment) => segment.cards).flatMap((card) => card.sentences);

    expect(Object.keys(migrated.sentenceStates).sort()).toEqual(newFlat.map((s) => s.id).sort());
    expect(newFlat.slice(0, 2).every((s) => migrated.sentenceStates[s.id].phase === 3)).toBe(true);
    expect(newFlat.slice(2, 4).every((s) => migrated.sentenceStates[s.id].phase === 2)).toBe(true);
    expect(migrated.sentenceStates[newFlat[0].id].passed).toBe(true);

    expect(migrated.cardBlindPassed).toEqual({});
    expect(migrated.linkSnowballPassed).toEqual({});
    expect(migrated.segmentSnowballPassed).toEqual({});
    expect(migrated.snowballPassed).toEqual([true]);

    expect(migrated.cursor).toEqual({
      passageId: newPassage.id,
      segmentId: newPassage.segments[0].id,
      cardId: newPassage.segments[0].cards[1].id,
      sentenceId: newPassage.segments[0].cards[1].sentences[0].id,
    });
    expect(migrated.currentSegment).toBe(0);
    expect(migrated.currentCardIndex).toBe(1);

    expect(migrated.fullTextCompleted).toBe(true);
    expect(migrated.fullTextPassed).toBe(true);
    expect(migrated.bestTime).toBe(12000);
    expect(migrated.bestPassedTime).toBe(12000);
    expect(migrated.lastAttemptTime).toBe('2026-08-04T00:00:00.000Z');
  });

  it('cursor 的 sentenceId 仍存在时定位到所在新卡', () => {
    const oldPassage = buildPassage('online:y', [['先帝创业未半而中道崩殂，']], 'v1');
    const newPassage = buildPassage('online:y', [['先帝创业未半而中道崩殂，']], 'v2');
    const target = oldPassage.segments[0].cards[0].sentences[0];

    const migrated = migrateRechunkedProgress(oldPassage, newPassage, {
      ...defaultProgress(),
      cursor: {
        passageId: oldPassage.id,
        segmentId: oldPassage.segments[0].id,
        cardId: oldPassage.segments[0].cards[0].id,
        sentenceId: target.id,
      },
    });

    expect(migrated.cursor?.sentenceId).toBe(newPassage.segments[0].cards[0].sentences[0].id);
    expect(migrated.currentSegment).toBe(0);
    expect(migrated.currentCardIndex).toBe(0);
  });

  it('无法映射的旧进度丢弃，不崩溃', () => {
    const oldPassage = buildPassage('online:z', [['完全不同的旧句文本。']], 'v1');
    const newPassage = buildPassage('online:z', [['新文本甲。', '新文本乙。']], 'v2');
    const oldCard = oldPassage.segments[0].cards[0];

    const migrated = migrateRechunkedProgress(oldPassage, newPassage, {
      ...defaultProgress(),
      sentenceStates: {
        [oldCard.sentences[0].id]: { phase: 3, passed: true },
      },
      fullTextPassed: true,
    });

    expect(migrated.sentenceStates).toEqual({});
    expect(migrated.fullTextPassed).toBe(true);
  });

  it('rechunkPassageIfNeeded：版本一致 / builtin 不重分，在线版本变化才迁移', () => {
    const progress = defaultProgress();
    const online = buildPassage('online:same', [['甲。']], 'v1');

    expect(rechunkPassageIfNeeded(online, buildPassage('online:same', [['甲。']], 'v1'), progress))
      .toBe(progress);

    const builtinOld = { ...buildPassage('builtin:b', [['甲。']], 'v1'), sourceType: 'builtin' as const };
    const builtinNew = { ...buildPassage('builtin:b', [['甲。']], 'v2'), sourceType: 'builtin' as const };
    expect(rechunkPassageIfNeeded(builtinOld, builtinNew, progress)).toBe(progress);

    const migrated = rechunkPassageIfNeeded(online, buildPassage('online:same', [['甲。']], 'v2'), progress);
    expect(migrated).toBeDefined();
    expect(migrated).not.toBe(progress);
  });
});
