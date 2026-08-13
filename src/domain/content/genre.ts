import { countHan } from '../../utils/text';

/**
 * 体裁检测（方案 A §3.2.1）：轻量启发式，纯正则 + 统计，不引入 NLP 依赖。
 *
 * - 诗（五言/七言）：以 `\n` 分隔的连续行每行纯汉字数恒为 5 或 7；
 *   或（无换行形态）逗号/句号分句长度全部恒为 5 / 全部恒为 7 且句数 ≥ 4。
 * - 词：标题含常见词牌名；或分句长度集中在 3–9 字（占比 ≥ 0.8）、
 *   最长分句 ≤ 10 字且分句数 ≥ 4（节奏整齐的短分句形态）。
 * - 散文：以上信号均不满足时按句号级为主切分。
 */
export type Genre = 'poem' | 'ci' | 'prose';

/** 与 normalize.ts 的 CLAUSE_BREAKS 保持一致的分句标点（本模块自维护，避免循环依赖）。 */
const BREAK_CHARS = new Set(['。', '！', '？', '；', '!', '?', ';', '，', '、', '：', ',', ':']);

const HAN_RE = /[\u3400-\u9fff]/u;

/** 常见词牌名（标题辅助判定）。 */
const CI_PAI_NAMES = [
  '永遇乐', '念奴娇', '水调歌头', '沁园春', '卜算子', '如梦令', '满江红',
  '江城子', '蝶恋花', '临江仙', '菩萨蛮', '西江月', '清平乐', '浣溪沙',
  '鹧鸪天', '虞美人', '声声慢', '青玉案', '摸鱼儿', '渔家傲', '破阵子',
  '南乡子', '定风波', '钗头凤', '相见欢', '浪淘沙', '忆江南', '采桑子',
  '一剪梅', '苏幕遮', '生查子', '长相思', '点绛唇', '木兰花', '贺新郎',
  '水龙吟', '醉花阴', '雨霖铃', '踏莎行', '鹊桥仙', '扬州慢', '桂枝香',
  '八声甘州', '风入松', '兰陵王', '念奴娇',
];

const CI_PAI_RE = new RegExp(`(${CI_PAI_NAMES.join('|')})`);

function splitTextLines(rawText: string): string[] {
  return String(rawText ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** 按分句标点切出各分句的纯汉字数（标点保留在上一分句内，不影响计数）。 */
function clauseHanLengths(text: string): number[] {
  const chars = Array.from(String(text ?? ''));
  const lengths: number[] = [];
  let han = 0;
  for (const character of chars) {
    if (BREAK_CHARS.has(character)) {
      if (han > 0) {
        lengths.push(han);
        han = 0;
      }
    } else if (HAN_RE.test(character)) {
      han += 1;
    }
  }
  if (han > 0) {
    lengths.push(han);
  }
  return lengths;
}

/**
 * 体裁检测。
 *
 * @param rawText 正文原始文本（可含 `\n` 行信号；标点保留）。
 * @param lines   以 `\n` 划分的行列表；缺省时由 rawText 推导。
 * @param title   篇目标题（用于词牌名辅助判定）。
 */
export function detectGenre(rawText: string, lines: string[] = splitTextLines(rawText), title = ''): Genre {
  // 1) 诗：`\n` 行的每行纯汉字数恒为 5 或 7（≥2 行）
  const lineHan = lines.map((line) => countHan(line));
  if (lineHan.length >= 2 && lineHan.every((n) => n === 5 || n === 7)) {
    return 'poem';
  }

  const lengths = clauseHanLengths(rawText);

  // 2) 诗（无换行形态）：分句长度全部恒为 5 或全部恒为 7，且 ≥4 句（绝句/律诗）
  if (lengths.length >= 4 && (lengths.every((n) => n === 5) || lengths.every((n) => n === 7))) {
    return 'poem';
  }

  // 3) 词：标题含常见词牌名
  if (title !== '' && CI_PAI_RE.test(title)) {
    return 'ci';
  }

  // 4) 词：分句长度集中在 3–9 字、最长 ≤10 字、句数 ≥4
  if (lengths.length >= 4) {
    const inRangeRatio = lengths.filter((n) => n >= 3 && n <= 9).length / lengths.length;
    const maxLength = Math.max(...lengths);
    if (inRangeRatio >= 0.8 && maxLength <= 10) {
      return 'ci';
    }
  }

  return 'prose';
}
