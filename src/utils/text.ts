/**
 * 文本工具：汉字判定 / 提取 / 计数。
 */

// Unicode Script=Han covers extensions and compatibility ideographs that the
// old U+4E00–U+9FA5 range silently dropped.
const HAN_RE = /\p{Script=Han}/u;

export function isHan(char: string): boolean {
  return HAN_RE.test(char);
}

/** 提取文本中的汉字序列（去掉标点、数字、字母等）。 */
export function extractHan(text: string): string[] {
  return Array.from(text).filter(isHan);
}

/** 统计文本中的汉字个数。 */
export function countHan(text: string): number {
  return extractHan(text).length;
}

/** 统计篇目全部正文的汉字个数。 */
export function countPassageHan(sentences: ReadonlyArray<{ text: string }>): number {
  let n = 0;
  for (const s of sentences) {
    n += countHan(s.text);
  }
  return n;
}
