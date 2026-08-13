/**
 * 轻量拼音首字母工具（本期占位实现）
 *
 * 背景：架构文档 D1 决策采用「构建期用 pinyin-pro 生成全量拼音索引」方案（T03 落地），
 * 本期（T01/T02/主界面）仅需支持搜索「拼音首字母」匹配，故先内置覆盖
 * 已入库篇目（标题/作者/朝代/年级）所需汉字的小型映射表，保证 `search("csb")` 命中出师表。
 * T03 交付后将由 `src/data/pinyinIndex.json` + `src/lib/pinyin.ts` 替换本文件。
 */

/** 字 → 拼音首字母（多音字用数组，任一命中即算）。仅覆盖本期 5 篇篇目的标题/作者/朝代/年级。 */
const CHAR_INITIALS: Record<string, string[]> = {
  // 篇目标题
  出: ['c'],
  师: ['s'],
  表: ['b'],
  前: ['q'],
  岳: ['y'],
  阳: ['y'],
  楼: ['l'],
  记: ['j'],
  陋: ['l'],
  室: ['s'],
  铭: ['m'],
  爱: ['a'],
  莲: ['l'],
  说: ['s'],
  桃: ['t'],
  花: ['h'],
  源: ['y'],
  // 作者
  诸: ['z'],
  葛: ['g'],
  亮: ['l'],
  范: ['f'],
  仲: ['z'],
  淹: ['y'],
  刘: ['l'],
  禹: ['y'],
  锡: ['x'],
  周: ['z'],
  敦: ['d'],
  颐: ['y'],
  陶: ['t'],
  渊: ['y'],
  明: ['m'],
  // 朝代
  三: ['s'],
  国: ['g'],
  蜀: ['s'],
  汉: ['h'],
  北: ['b'],
  宋: ['s'],
  唐: ['t'],
  东: ['d'],
  晋: ['j'],
  // 年级
  九: ['j'],
  年: ['n'],
  级: ['j'],
  上: ['s'],
  下: ['x'],
  七: ['q'],
  八: ['b'],
};

/** 取单个汉字的拼音首字母集合；非汉字返回 undefined。 */
export function charInitials(char: string): string[] | undefined {
  return CHAR_INITIALS[char];
}

/** 取文本的拼音首字母串（仅中文，非中文跳过），如 "出师表" → "csb"。 */
export function textInitials(text: string): string {
  let out = '';
  for (const ch of Array.from(text)) {
    const initials = CHAR_INITIALS[ch];
    if (initials && initials.length > 0) {
      out += initials[0];
    }
  }
  return out;
}

/** 归一化关键词：小写 + 去空格。 */
export function normalizeKeyword(keyword: string): string {
  return keyword.toLowerCase().replace(/\s+/g, '');
}

/** 判断 keyword 是否与 text 的拼音首字母串匹配（前缀或包含）。 */
export function matchByInitials(keyword: string, text: string): boolean {
  const kw = normalizeKeyword(keyword);
  if (kw === '') {
    return false;
  }
  const initials = textInitials(text);
  return initials.startsWith(kw) || initials.includes(kw);
}
