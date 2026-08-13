import type { Passage, PassageMeta } from '../../types';
import { countPassageHan } from '../../utils/text';
import { matchByInitials, normalizeKeyword, textInitials } from '../../utils/pinyin';

import { chushibiao } from './chushibiao';
import { yueyanglouji } from './yueyanglouji';
import { loushiming } from './loushiming';
import { ailianshuo } from './ailianshuo';
import { taohuayuanji } from './taohuayuanji';

/** 篇目注册表：内置篇目数组，未来新增篇目只需在此追加。 */
let registry: Passage[] = [chushibiao, yueyanglouji, loushiming, ailianshuo, taohuayuanji];

function toMeta(p: Passage): PassageMeta {
  return {
    id: p.id,
    title: p.title,
    author: p.author,
    dynasty: p.dynasty,
    grade: p.grade,
    aliases: p.aliases,
    charCount: countPassageHan(p.segments.flatMap((segment) => segment.cards.flatMap((card) => card.sentences))),
  };
}

/**
 * 搜索命中评分（架构 §3.2 命中优先级）：
 * 标题前缀 > 标题包含 > 别名 > 标题拼音首字母 > 作者/朝代。
 */
function scorePassage(p: Passage, kw: string): number {
  const title = normalizeKeyword(p.title);
  const titleInitials = textInitials(p.title);
  const author = normalizeKeyword(p.author);
  const authorInitials = textInitials(p.author);
  const dynasty = normalizeKeyword(p.dynasty);
  const aliases = (p.aliases ?? []).map(normalizeKeyword);

  if (title.startsWith(kw)) return 100;
  if (title.includes(kw)) return 90;
  if (aliases.some((a) => a.startsWith(kw) || a.includes(kw))) return 80;
  if (titleInitials.startsWith(kw)) return 70;
  if (titleInitials.includes(kw)) return 60;
  if (author.startsWith(kw) || author.includes(kw)) return 50;
  if (authorInitials.startsWith(kw) || authorInitials.includes(kw)) return 45;
  if (dynasty.startsWith(kw) || dynasty.includes(kw)) return 40;
  return 0;
}

export const passageRegistry = {
  /** Replaces bundled content with the server catalog after archive bootstrap. */
  replaceFromServer(passages: readonly Passage[]): void {
    if (passages.length > 0) registry = [...passages];
  },

  /** 全部篇目元信息（列表展示用，不含正文）。 */
  list(): PassageMeta[] {
    return registry.map(toMeta);
  },

  /** 按 id 取篇目（不存在返回 undefined）。 */
  get(id: string): Passage | undefined {
    return registry.find((p) => p.id === id);
  },

  /**
   * 本地模糊搜索：篇目名 / 别名 / 作者 / 朝代 / 拼音首字母（如 "csb" → 出师表）。
   * 结果按命中优先级排序，最多 8 条。
   */
  search(keyword: string): PassageMeta[] {
    const kw = normalizeKeyword(keyword);
    if (kw === '') {
      return [];
    }
    return registry
      .map((p) => ({ meta: toMeta(p), score: scorePassage(p, kw) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.meta.charCount - b.meta.charCount;
      })
      .slice(0, 8)
      .map((item) => item.meta);
  },

  /** 按拼音首字母直接匹配篇目标题（供搜索候选高亮等场景使用）。 */
  matchByInitials(keyword: string, text: string): boolean {
    return matchByInitials(keyword, text);
  },
};
