import type { Sentence } from '../../types';
import { countHan } from '../../utils/text';
import type { Genre } from './genre';

/** Groups one or two adjacent sentences, aiming for a 15-25 Han-character card. */
export function chunkCards(sentences: readonly Sentence[]): Sentence[][] {
  const cards: Sentence[][] = [];
  let index = 0;

  while (index < sentences.length) {
    const first = sentences[index];
    const second = sentences[index + 1];
    const firstCount = countHan(first.text);
    if (second && firstCount < 30 && firstCount + countHan(second.text) <= 55) {
      cards.push([first, second]);
      index += 2;
    } else {
      cards.push([first]);
      index += 1;
    }
  }
  return cards;
}

export interface ChunkCardsV2Options {
  genre: Genre;
  /** 目标区间下限（汉字）；缺省 15。 */
  minHan?: number;
  /** 目标区间上限（汉字）；缺省 25。超过 25 强制切卡。 */
  maxHan?: number;
  /** 卡内分句数硬上限（与 createCardPlan 的 1–N 保持一致）；缺省 6。 */
  maxSentences?: number;
}

const DEFAULT_MIN_HAN = 15;
const DEFAULT_MAX_HAN = 25;
const DEFAULT_MAX_SENTENCES = 6;

/** 词：相邻两拍合并为一卡的字数上限（与 maxHan 一致，保证合并后不超上限且尽量凑到 15+）。 */
const CI_PAIR_MERGE_HAN = 25;

/**
 * 当前切卡规则快照：供导入链路把规则纳入 contentVersion 哈希，
 * 规则变化后存量在线篇目重导时自动触发 rechunk 迁移。
 */
export const DEFAULT_CHUNK_RULES = {
  minHan: DEFAULT_MIN_HAN,
  maxHan: DEFAULT_MAX_HAN,
  maxSentences: DEFAULT_MAX_SENTENCES,
  pairMergeHan: CI_PAIR_MERGE_HAN,
} as const;

/** 判断分句是否以句号/分号级标点结尾（散文"不跨 。！？"、词"拍边界"）。 */
function endsSentence(clause: Sentence): boolean {
  return /[。！？!?；;]$/.test(clause.text.trim());
}

/**
 * 体裁自适应切卡（方案 A §3.2.4）：目标区间 15–25 汉字，卡内 1–N 分句。
 *
 * - 诗：按对仗联组织，卡 = 1–2 联（五言 10/20 字，七言 14/28 字），不跨联；
 * - 词：先按拍分组（句号/分号为拍边界），默认 1 拍 = 1 卡、不跨拍；
 *   仅当相邻两拍总字数 ≤ 25 字时才合并为 1 卡；单拍 > maxHan 时拍内按分句强制切卡；
 * - 散文：以句号级句子为卡，不跨 `。！？`；超长句在导入期已二次切分。
 *
 * 单分句超过 maxHan 的极端情况兜底为单句成卡并打日志，不做静默截断。
 */
export function chunkCardsV2(clauses: readonly Sentence[], options: ChunkCardsV2Options): Sentence[][] {
  const minHan = options.minHan ?? DEFAULT_MIN_HAN;
  const maxHan = options.maxHan ?? DEFAULT_MAX_HAN;
  const maxSentences = options.maxSentences ?? DEFAULT_MAX_SENTENCES;

  if (clauses.length === 0) {
    return [];
  }

  let cards: Sentence[][];
  if (options.genre === 'poem') {
    cards = chunkPoem(clauses, maxHan, maxSentences);
  } else if (options.genre === 'ci') {
    cards = chunkCi(clauses, { minHan, maxHan, maxSentences });
  } else {
    cards = chunkGreedy(clauses, { minHan, maxHan, maxSentences, blockEndsSentence: true });
  }
  cards = enforceMaxSentences(cards, maxSentences);

  // 兜底：单分句超长成卡（仅打日志，不静默截断）。
  for (const card of cards) {
    if (card.length === 1) {
      const han = countHan(card[0].text);
      if (han > maxHan) {
        console.warn(`[chunk] 单分句超过 ${maxHan} 字，兜底单句成卡（${han} 字）：${card[0].text}`);
      }
    }
  }
  return cards;
}

/** 诗：按对仗联（2 分句/联）组织，卡 = 1–2 联，不跨联。 */
function chunkPoem(clauses: readonly Sentence[], maxHan: number, maxSentences: number): Sentence[][] {
  const cards: Sentence[][] = [];
  let index = 0;
  while (index < clauses.length) {
    const couplet = clauses.slice(index, index + 2);
    const nextCouplet = clauses.slice(index + 2, index + 4);
    const candidate = [...couplet, ...nextCouplet];
    const candidateHan = countHan(candidate.map((clause) => clause.text).join(''));
    if (nextCouplet.length > 0 && candidateHan <= maxHan && candidate.length <= maxSentences) {
      cards.push(candidate);
      index += 4;
    } else {
      cards.push(couplet);
      index += 2;
    }
  }
  return cards;
}

interface CiOptions {
  minHan: number;
  maxHan: number;
  maxSentences: number;
}

/**
 * 词：按拍（句号/分号结尾为拍界）组织卡片，不跨拍。
 * 默认 1 拍 = 1 卡；相邻两拍合计 ≤ CI_PAIR_MERGE_HAN 时合并为 1 卡；
 * 单拍超过 maxHan（如全逗号形态）时拍内按分句贪心强制切卡，保证单卡 ≤ maxHan。
 */
function chunkCi(clauses: readonly Sentence[], options: CiOptions): Sentence[][] {
  // 1) 按拍分组
  const pai: Sentence[][] = [];
  let currentPai: Sentence[] = [];
  for (const clause of clauses) {
    currentPai.push(clause);
    if (endsSentence(clause)) {
      pai.push(currentPai);
      currentPai = [];
    }
  }
  if (currentPai.length > 0) {
    pai.push(currentPai);
  }

  // 2) 拍级贪心：1 拍 = 1 卡，相邻两拍 ≤24 字才合并
  const cards: Sentence[][] = [];
  let pending: Sentence[] = [];
  let pendingHan = 0;

  const flushPending = (): void => {
    if (pending.length > 0) {
      cards.push(pending);
      pending = [];
      pendingHan = 0;
    }
  };

  for (const onePai of pai) {
    const paiHan = countHan(onePai.map((clause) => clause.text).join(''));
    if (paiHan > options.maxHan) {
      // 单拍超长：先落盘 pending，再在拍内按分句强制切卡（不跨可识别边界）
      flushPending();
      for (const card of chunkGreedy(onePai, {
        minHan: options.minHan,
        maxHan: options.maxHan,
        maxSentences: options.maxSentences,
        blockEndsSentence: false,
      })) {
        cards.push(card);
      }
      continue;
    }

    const mergesByLength = pendingHan + paiHan <= CI_PAIR_MERGE_HAN;
    const mergesByCount = pending.length + onePai.length <= options.maxSentences;
    if (pending.length > 0 && mergesByLength && mergesByCount) {
      pending = [...pending, ...onePai];
      pendingHan += paiHan;
    } else {
      flushPending();
      pending = [...onePai];
      pendingHan = paiHan;
    }
  }
  flushPending();
  return mergeTinyTail(cards, options.minHan, options.maxHan, options.maxSentences);
}

/**
 * 词兜底：合并末尾过小的卡（< minHan）进前卡，避免孤卡（如 22+5 → 27）。
 * 仅在合并后分句数仍 ≤ maxSentences、且合并字数 ≤ maxHan + MERGE_TAIL_TOLERANCE
 * 时执行（容差 5 字，对齐旧 30 字上限，避免制造超长卡）；散文不走此路径（保持不跨句号）。
 */
function mergeTinyTail(
  cards: Sentence[][],
  minHan: number,
  maxHan: number,
  maxSentences: number,
): Sentence[][] {
  const result = [...cards];
  while (result.length > 1) {
    const tail = result[result.length - 1];
    const tailHan = countHan(tail.map((clause) => clause.text).join(''));
    if (tailHan >= minHan) {
      break;
    }
    const prev = result[result.length - 2];
    const mergedHan = tailHan + countHan(prev.map((clause) => clause.text).join(''));
    if (prev.length + tail.length > maxSentences || mergedHan > maxHan + MERGE_TAIL_TOLERANCE) {
      break;
    }
    result.pop();
    result[result.length - 1] = [...prev, ...tail];
  }
  return result;
}

/** 尾卡归并允许超出的字数容差（对齐历史 30 字上限：25 + 5）。 */
const MERGE_TAIL_TOLERANCE = 5;

/** 硬性保证：任何卡的分句数不超过 maxSentences（与 createCardPlan 的 1–N 上限一致）。 */
function enforceMaxSentences(cards: Sentence[][], maxSentences: number): Sentence[][] {
  const result: Sentence[][] = [];
  for (const card of cards) {
    if (card.length <= maxSentences) {
      result.push(card);
      continue;
    }
    for (let index = 0; index < card.length; index += maxSentences) {
      result.push(card.slice(index, index + maxSentences));
    }
  }
  return result;
}

interface GreedyOptions {
  minHan: number;
  maxHan: number;
  maxSentences: number;
  /** 散文：当前卡末分句以句号级标点结尾时强制断卡（不跨 `。！？`）。 */
  blockEndsSentence: boolean;
}

/** 贪心合并：累计到 ≤maxHan；>maxHan 或句数触顶或句号边界时断卡。 */
function chunkGreedy(clauses: readonly Sentence[], options: GreedyOptions): Sentence[][] {
  const cards: Sentence[][] = [];
  let current: Sentence[] = [];

  for (const clause of clauses) {
    if (current.length > 0) {
      const currentHan = countHan(current.map((item) => item.text).join(''));
      const blocked = options.blockEndsSentence && endsSentence(current[current.length - 1]);
      const overLength = currentHan + countHan(clause.text) > options.maxHan;
      const overCount = current.length >= options.maxSentences;
      if (blocked || overLength || overCount) {
        cards.push(current);
        current = [];
      }
    }
    current.push(clause);
  }

  if (current.length > 0) {
    cards.push(current);
  }
  return cards;
}

/** Groups cards into balanced three-to-four-card segments (a short final pair is allowed). */
export function chunkSegments<T>(cards: readonly T[]): T[][] {
  if (cards.length === 0) {
    return [];
  }
  if (cards.length <= 4) {
    return [[...cards]];
  }
  if (cards.length === 5) {
    return [[...cards.slice(0, 3)], [...cards.slice(3)]];
  }

  const segmentCount = Math.ceil(cards.length / 4);
  const baseSize = Math.floor(cards.length / segmentCount);
  const largerSegments = cards.length % segmentCount;
  const chunks: T[][] = [];
  let index = 0;
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const size = baseSize + (segmentIndex >= segmentCount - largerSegments ? 1 : 0);
    chunks.push([...cards.slice(index, index + size)]);
    index += size;
  }
  return chunks;
}
