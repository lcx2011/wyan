import type { ApiPassageDetail, GushiContentItem } from '../../api/gushiwen';
import type { Card, Passage, Segment, Sentence } from '../../types';
import { chunkCardsV2, chunkSegments, DEFAULT_CHUNK_RULES } from './chunk';
import { detectGenre, type Genre } from './genre';
import { memberId, sentenceId, sha256 } from './identity';
import { normalizeText, normalizeTextPreservingLines, splitSentences, type SentenceSplitMode } from './normalize';
import { acceptedInitials } from '../typing/pinyin';

const HAN_RE = /[\u3400-\u9fff]/u;

export interface ImportPassageOptions {
  /** Cache timestamp supplied by the fetch/import boundary. */
  cachedAt?: string;
  /** Injectable clock for callers that need a fresh, deterministic test boundary. */
  now?: () => Date;
}

function pinyinTokens(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .match(/[a-züv]+[1-5]?/giu) ?? [];
}

function hanCount(value: string): number {
  return Array.from(value).filter((character) => HAN_RE.test(character)).length;
}

function splitItem(
  item: GushiContentItem,
  mode: SentenceSplitMode,
): Array<{ text: string; meaning: string; pinyin?: string }> {
  const text = normalizeText(item.yuanwen ?? '');
  if (!text) {
    return [];
  }
  // 散文走句号级（超长句在逗号处二次切分）；诗/词走分句级。
  const sentences = splitSentences(text, { mode });
  const tokens = pinyinTokens(normalizeText(item.pinyin ?? ''));
  const aligned = tokens.length === hanCount(text);
  let tokenIndex = 0;
  return sentences.map((sentence) => {
    // 分句拼接回原文按汉字数切片仍精确对齐（\n 不占汉字数，已被 normalizeText 折叠）。
    const sentenceTokens = aligned ? tokens.slice(tokenIndex, tokenIndex + hanCount(sentence)) : [];
    tokenIndex += aligned ? hanCount(sentence) : 0;
    return {
      text: sentence,
      meaning: normalizeText(item.yiwen ?? ''),
      pinyin: sentenceTokens.length === hanCount(sentence) ? sentenceTokens.join(' ') : undefined,
    };
  });
}

/** Converts an API passage into a fully deterministic strict domain Passage. */
export async function importPassage(
  detail: ApiPassageDetail,
  sourceId: string,
  options: ImportPassageOptions = {},
): Promise<Passage> {
  const title = normalizeText(detail.title?.name ?? '') || sourceId;
  const author = normalizeText(detail.title?.author ?? '') || '佚名';
  const dynasty = normalizeText(detail.title?.chaodai ?? '') || '未知';
  const items: GushiContentItem[] = typeof detail.content === 'string'
    ? [{ yuanwen: detail.content }]
    : Array.isArray(detail.poem_data?.content) ? detail.poem_data.content : [];

  // 体裁检测：拼接保留 `\n` 行信号的原文，散文/诗/词走不同切分与合并策略。
  const preservedLines = items
    .map((item) => normalizeTextPreservingLines(item.yuanwen ?? ''))
    .filter((line) => line.length > 0);
  const bodyText = preservedLines.join('\n');
  const genre: Genre = detectGenre(bodyText, bodyText.split('\n'), title);
  const splitMode: SentenceSplitMode = genre === 'prose' ? 'sentence' : 'clause';

  const rawSentences = items.flatMap((item) => splitItem(item, splitMode));
  if (rawSentences.length === 0) {
    throw new Error('原文为空');
  }

  const occurrences = new Map<string, number>();
  const sentences: Sentence[] = [];
  for (const raw of rawSentences) {
    const occurrence = occurrences.get(raw.text) ?? 0;
    occurrences.set(raw.text, occurrence + 1);
    sentences.push({
      id: await sentenceId(sourceId, raw.text, occurrence),
      text: raw.text,
      meaning: raw.meaning,
      acceptedInitials: acceptedInitials(raw.text, raw.pinyin),
      ...(raw.pinyin ? { pinyin: raw.pinyin } : {}),
    });
  }

  const cards: Card[] = [];
  for (const sentenceGroup of chunkCardsV2(sentences, { genre, ...DEFAULT_CHUNK_RULES })) {
    cards.push({ id: await memberId(sentenceGroup.map((sentence) => sentence.id)), sentences: sentenceGroup });
  }

  const segments: Segment[] = [];
  for (const [index, cardGroup] of chunkSegments(cards).entries()) {
    segments.push({ id: await memberId(cardGroup.map((card) => card.id)), index, cards: cardGroup });
  }

  // contentVersion 纳入体裁与切卡规则：切分策略变化会自然驱动 F14/D3 迁移入口。
  const contentVersion = await sha256(JSON.stringify({
    title,
    author,
    dynasty,
    genre,
    chunkRules: DEFAULT_CHUNK_RULES,
    sentences: rawSentences.map(({ text, meaning }) => [text, meaning]),
  }));

  return {
    id: sourceId,
    sourceType: 'online',
    sourceId,
    contentVersion,
    title,
    author,
    dynasty,
    genre,
    cachedAt: options.cachedAt ?? (options.now ?? (() => new Date()))().toISOString(),
    segments,
  };
}
