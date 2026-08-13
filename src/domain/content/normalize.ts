import { countHan } from '../../utils/text';
import { detectGenre } from './genre';

export type SentenceSplitMode = 'sentence' | 'clause' | 'auto';

export interface NormalizeTextOptions {
  /** 保留 `\n` 作为行信号（供体裁检测使用）；缺省折叠全部空白。 */
  preserveLines?: boolean;
}

export interface SplitSentencesOptions {
  /**
   * - 'sentence'：句号级切分；单个句号级句子 >25 汉字时在逗号/顿号处二次切分（防超长句）。
   * - 'clause'：背诵分句级切分（逗号/顿号/句号全分句）。
   * - 'auto'（默认）：先做体裁检测，散文走 sentence，诗/词走 clause。保持向后兼容。
   */
  mode?: SentenceSplitMode;
}

/** Removes API markup and normalizes whitespace without changing punctuation. */
export function normalizeText(raw: string, options: NormalizeTextOptions = {}): string {
  const value = String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/\u00a0/g, ' ');
  if (options.preserveLines === true) {
    // 折叠行内空白、合并连续空行、去首尾空行，但保留 `\n` 行信号。
    return value
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .replace(/^\n+|\n+$/g, '')
      .trim();
  }
  return value.replace(/\s+/g, ' ').trim();
}

/** Variant that keeps newlines as line signals for genre detection. */
export function normalizeTextPreservingLines(raw: string): string {
  return normalizeText(raw, { preserveLines: true });
}

const SENTENCE_ENDINGS = new Set(['。', '！', '？', '；', '!', '?', ';']);

/** 分句标点：句末标点 + 逗号/顿号/冒号（背诵分句级）。 */
export const CLAUSE_BREAKS = new Set([...SENTENCE_ENDINGS, '，', '、', '：', ',', ':']);

const CLOSING_PUNCTUATION = new Set(['”', '’', '」', '』', '》', '】', ')', '）']);

function splitAtBreaks(text: string, breaks: ReadonlySet<string>): string[] {
  const chars = Array.from(text);
  const parts: string[] = [];
  let start = 0;

  for (let index = 0; index < chars.length; index += 1) {
    if (!breaks.has(chars[index])) {
      continue;
    }
    let end = index + 1;
    while (end < chars.length && CLOSING_PUNCTUATION.has(chars[end])) {
      end += 1;
    }
    const part = chars.slice(start, end).join('').trim();
    if (part) {
      parts.push(part);
    }
    start = end;
    index = end - 1;
  }

  const remainder = chars.slice(start).join('').trim();
  if (remainder) {
    parts.push(remainder);
  }
  return parts;
}

/** Splits prose at sentence punctuation and retains every terminal mark. */
export function splitSentences(text: string, options: SplitSentencesOptions = {}): string[] {
  const mode = options.mode ?? 'auto';
  if (mode === 'auto') {
    const genre = detectGenre(text);
    return splitSentences(text, { mode: genre === 'prose' ? 'sentence' : 'clause' });
  }

  const normalized = normalizeText(text);
  if (mode === 'clause') {
    return splitAtBreaks(normalized, CLAUSE_BREAKS);
  }

  const sentences = splitAtBreaks(normalized, SENTENCE_ENDINGS);
  // 散文超长句（>25 汉字）在逗号/顿号处二次切分，避免 30+ 字大句直接成卡。
  return sentences.flatMap((sentence) =>
    countHan(sentence) > 25 ? splitAtBreaks(sentence, CLAUSE_BREAKS) : [sentence]
  );
}

/** Splits text into recitation clauses (comma/colon/period level). */
export function splitClauses(text: string): string[] {
  return splitSentences(text, { mode: 'clause' });
}
