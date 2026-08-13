import type { Passage, PassageProgress, Phase } from '../../types';
import { extractHan } from '../../utils/text';

/**
 * 存量分卡迁移（方案 A §3.2.6）：旧大句 → 新分句的进度映射。
 *
 * 触发条件：在线篇目重新导入且 contentVersion 变化（由 passageStore 接入）。
 * 处置规则：
 * - sentenceStates：按"纯汉字序列拼接相等"把旧句 phase 以 max 继承给新分句；无法映射丢弃；
 * - cardBlindPassed / linkSnowballPassed / segmentSnowballPassed：段/卡重组 → 重置；
 * - cursor / currentSegment / currentCardIndex：cursor.sentenceId 存在则定位所在新卡，否则重置首卡；
 * - fullTextCompleted / fullTextPassed / bestTime / bestPassedTime / lastAttemptTime：篇目级 → 保留；
 * - snowballPassed：按新段数截断保留。
 */

export interface RechunkMigrationOptions {
  /** Injectable diagnostics logger（缺省 console.warn）。 */
  warn?: (message: string) => void;
}

interface PassageSentenceEntry {
  id: string;
  han: string;
  segmentIndex: number;
  cardIndex: number;
}

function collectPassageSentences(passage: Passage): PassageSentenceEntry[] {
  const entries: PassageSentenceEntry[] = [];
  passage.segments.forEach((segment, segmentIndex) => {
    segment.cards.forEach((card, cardIndex) => {
      card.sentences.forEach((sentence) => {
        entries.push({
          id: sentence.id,
          han: extractHan(sentence.text).join(''),
          segmentIndex,
          cardIndex,
        });
      });
    });
  });
  return entries;
}

interface HanRun {
  entries: Array<{ id: string }>;
  endIndex: number;
}

/** 从 startIndex 起找一段新分句，其纯汉字拼接恰好等于 targetHan；超长且不相等则无解。 */
function findHanRun(
  newSentences: readonly PassageSentenceEntry[],
  startIndex: number,
  targetHan: string,
): HanRun | null {
  let accumulated = '';
  for (let index = startIndex; index < newSentences.length; index += 1) {
    accumulated += newSentences[index].han;
    if (accumulated.length >= targetHan.length) {
      if (accumulated === targetHan) {
        return { entries: newSentences.slice(startIndex, index + 1), endIndex: index + 1 };
      }
      return null;
    }
  }
  return null;
}

/**
 * 把旧篇目下的进度迁移到新篇目（同一 sourceId，切分规则变化）。
 * 返回新的 PassageProgress；映射结果为空时按重置语义处理。
 */
export function migrateRechunkedProgress(
  oldPassage: Passage,
  newPassage: Passage,
  oldProgress: PassageProgress,
  options: RechunkMigrationOptions = {},
): PassageProgress {
  const warn = options.warn ?? ((message: string) => console.warn(message));

  const oldSentences = collectPassageSentences(oldPassage);
  const oldHanById = new Map(oldSentences.map((entry) => [entry.id, entry.han]));
  const newSentences = collectPassageSentences(newPassage);
  const newById = new Map(newSentences.map((entry) => [entry.id, entry]));

  // 1) sentenceStates：旧大句 → 新分句 phase 继承
  const sentenceStates: PassageProgress['sentenceStates'] = {};
  const matchedNewIds = new Set<string>();
  const oldToNewIds = new Map<string, string[]>();
  let pointer = 0;

  // 必须按篇目原始句序迁移，不能依赖 sentenceStates 的写入顺序；用户可能乱序浏览过卡片。
  for (const oldSentence of oldSentences) {
    const oldId = oldSentence.id;
    const oldState = oldProgress.sentenceStates[oldId];
    if (!oldState) continue;
    const oldHan = oldHanById.get(oldId);
    if (oldHan === undefined || oldHan === '') {
      continue; // 旧句不在旧篇目 / 无汉字 → 无法映射，丢弃
    }
    let match = findHanRun(newSentences, pointer, oldHan);
    if (!match) {
      // 起点不匹配时向后搜索（跳过无法映射的新分句）
      for (let start = pointer + 1; start < newSentences.length && !match; start += 1) {
        match = findHanRun(newSentences, start, oldHan);
      }
      if (!match) {
        warn(`[rechunk] 旧句无法映射到新分句，已丢弃进度：${oldPassage.id}`);
        continue;
      }
    }
    for (const entry of match.entries) {
      if (matchedNewIds.has(entry.id)) {
        continue; // 已被更早旧句映射（重叠保护），保持先到先得
      }
      matchedNewIds.add(entry.id);
      const previous = sentenceStates[entry.id];
      const phase = previous ? Math.max(previous.phase, oldState.phase) as Phase : oldState.phase;
      sentenceStates[entry.id] = {
        phase,
        passed: previous?.passed === true || oldState.passed,
      };
    }
    oldToNewIds.set(oldId, match.entries.map((entry) => entry.id));
    pointer = match.endIndex;
  }

  // 2) cursor / currentSegment / currentCardIndex 重解析
  let cursor = oldProgress.cursor;
  let currentSegment = oldProgress.currentSegment;
  let currentCardIndex = oldProgress.currentCardIndex;
  if (cursor) {
    const mappedId = oldToNewIds.get(cursor.sentenceId)?.[0];
    const entry = newById.get(cursor.sentenceId) ?? (mappedId ? newById.get(mappedId) : undefined);
    if (entry) {
      const segment = newPassage.segments[entry.segmentIndex];
      cursor = {
        passageId: newPassage.id,
        segmentId: segment.id,
        cardId: segment.cards[entry.cardIndex].id,
        sentenceId: entry.id,
      };
      currentSegment = entry.segmentIndex;
      currentCardIndex = entry.cardIndex;
    } else {
      // sentenceId 与文本映射都不存在 → 重置到首卡，不把旧位置套到无关正文。
      cursor = null;
      currentSegment = 0;
      currentCardIndex = 0;
    }
  } else {
    // 极简保护：无有效 cursor 时回到首卡，避免切分后段/卡数量变少导致越界
    currentSegment = 0;
    currentCardIndex = 0;
  }

  // 3) 仅保留稳定 ID 且汉字正文未变化的段/卡级状态；译文/作者变化
  // 不应让训练成果回退，但重新分卡后复用的下标型 id 也不能冒充旧卡。
  const cardHan = (card: Passage['segments'][number]['cards'][number]) =>
    card.sentences.flatMap((sentence) => extractHan(sentence.text)).join('');
  const oldCardsById = new Map(
    oldPassage.segments.flatMap((segment) => segment.cards.map((card) => [card.id, card] as const)),
  );
  const stableCardIds = new Set(
    newPassage.segments
      .flatMap((segment) => segment.cards)
      .filter((card) => {
        const oldCard = oldCardsById.get(card.id);
        return oldCard !== undefined && cardHan(oldCard) === cardHan(card);
      })
      .map((card) => card.id),
  );
  const oldSegmentsById = new Map(oldPassage.segments.map((segment) => [segment.id, segment] as const));
  const stableSegmentIds = new Set(
    newPassage.segments
      .filter((segment) => {
        const oldSegment = oldSegmentsById.get(segment.id);
        return oldSegment !== undefined
          && oldSegment.cards.length === segment.cards.length
          && segment.cards.every((card) => stableCardIds.has(card.id));
      })
      .map((segment) => segment.id),
  );
  const stableLinkIds = new Set(newPassage.segments.flatMap((segment) =>
    segment.cards.slice(1).flatMap((card, index) => {
      const previous = segment.cards[index];
      return stableCardIds.has(previous.id) && stableCardIds.has(card.id)
        ? [`card:${previous.id}|card:${card.id}`]
        : [];
    })
  ));
  const cardBlindPassed = Object.fromEntries(
    Object.entries(oldProgress.cardBlindPassed).filter(([id, passed]) => passed && stableCardIds.has(id))
  );
  const cardMastery = Object.fromEntries(
    Object.entries(oldProgress.cardMastery).filter(([id]) => stableCardIds.has(id))
  );
  const linkSnowballPassed = Object.fromEntries(
    Object.entries(oldProgress.linkSnowballPassed).filter(([id, passed]) => passed && stableLinkIds.has(id))
  );
  const segmentSnowballPassed = Object.fromEntries(
    Object.entries(oldProgress.segmentSnowballPassed).filter(([id, passed]) => passed && stableSegmentIds.has(id))
  );
  const snowballPassed = newPassage.segments.map((segment, index) =>
    segmentSnowballPassed[segment.id] === true || oldProgress.snowballPassed[index] === true && oldPassage.segments[index]?.id === segment.id
  );

  return {
    contentVersion: newPassage.contentVersion,
    cursor,
    currentSegment,
    currentCardIndex,
    sentenceStates,
    cardMastery,
    cardBlindPassed,
    linkSnowballPassed,
    segmentSnowballPassed,
    snowballPassed,
    fullTextCompleted: oldProgress.fullTextCompleted,
    fullTextPassed: oldProgress.fullTextPassed,
    lastAttemptTime: oldProgress.lastAttemptTime,
    bestPassedTime: oldProgress.bestPassedTime,
    bestTime: oldProgress.bestTime,
    updatedAt: oldProgress.updatedAt,
  };
}

/**
 * 仅在"同一在线篇目、contentVersion 变化"时执行迁移；builtin 篇目不重分。
 * 返回 undefined 表示无需迁移（无进度 / 版本一致 / 非在线）。
 */
export function rechunkPassageIfNeeded(
  oldPassage: Passage,
  newPassage: Passage,
  progress: PassageProgress | undefined,
  options: RechunkMigrationOptions = {},
): PassageProgress | undefined {
  if (!progress) {
    return undefined;
  }
  if (oldPassage.contentVersion === newPassage.contentVersion) {
    return progress;
  }
  if (oldPassage.sourceType !== 'online' || newPassage.sourceType !== 'online') {
    return progress;
  }
  return migrateRechunkedProgress(oldPassage, newPassage, progress, options);
}
