import { pinyin } from 'pinyin-pro';

/**
 * 领域类型定义（对应架构文档 §3.1）
 * 全部 TS 接口集中于此，供数据层 / 状态层 / UI 层共享。
 */

// ---------- 篇目 ----------

/** 句（背诵分句）：文本为含标点的背诵分句（散文为句号级，诗/词为逗号/顿号级分句）；meaning 为标准释义。 */
export interface Sentence {
  id: string;
  text: string;
  meaning: string;
  acceptedInitials: string[][];
  hint?: string;
  /** 拼音（在线篇目来源携带，可选）。 */
  pinyin?: string;
}

/**
 * 卡：背诵单元，由 1–N（N≤6）个连续背诵分句组成，通常 12–30 汉字；
 * 数据准备期已按体裁自适应规则（方案 A）生成：诗按对仗联、词按分句贪心、散文不跨句号。
 */
export interface Card {
  id: string;
  sentences: Sentence[];
}

export interface Segment {
  id: string;
  index: number;
  cards: Card[];
  hint?: string;
}

/** 篇目：内置静态数据。sentences 为全篇句子平铺（segments 展开而来）。 */
export interface Passage {
  id: string;
  sourceType: 'builtin' | 'online';
  sourceId: string;
  contentVersion: string;
  title: string;
  author: string;
  dynasty: string;
  cachedAt: string;
  grade?: string;
  aliases?: string[];
  /** 体裁（在线篇目导入时按启发式检测）：poem=诗、ci=词、prose=散文。 */
  genre?: 'poem' | 'ci' | 'prose';
  /** 来源标记：内置篇目缺省；在线篇目为 `online:{uuid}`。 */
  segments: Segment[];
}

/** 篇目元信息：用于列表 / 搜索结果展示（不含正文）。 */
export interface LegacySentenceInput {
  text: string;
  meaning: string;
  hint?: string;
  pinyin?: string;
}

export interface LegacySegmentInput {
  index: number;
  cards?: LegacySentenceInput[][];
  sentences?: LegacySentenceInput[];
  hint?: string;
}

export interface LegacyPassageInput {
  id: string;
  title: string;
  author: string;
  dynasty: string;
  grade?: string;
  aliases?: string[];
  sourceId?: string;
  segments: LegacySegmentInput[];
  updatedAt: string;
}

/** Converts the existing bundled data layout into the strict formal schema. */
export function createFormalPassage(input: LegacyPassageInput): Passage {
  const sourceId = input.sourceId ?? input.id;
  const sourceType = sourceId.startsWith('online:') ? 'online' : 'builtin';
  const toSentence = (value: LegacySentenceInput, id: string): Sentence => ({
    id,
    text: value.text,
    meaning: value.meaning,
    acceptedInitials: Array.from(value.text)
      .filter((character) => /[\u3400-\u9fff]/.test(character))
      .map((character) =>
        pinyin(character, { type: 'all', multiple: true })
          .map((reading) => reading.first.normalize('NFD').replace(/\p{Diacritic}/gu, ''))
          .filter((initial, index, initials) => initial !== '' && initials.indexOf(initial) === index)
      ),
    hint: value.hint,
    pinyin: value.pinyin,
  });

  return {
    id: input.id,
    sourceType,
    sourceId,
    contentVersion: `legacy:${input.updatedAt}`,
    title: input.title,
    author: input.author,
    dynasty: input.dynasty,
    cachedAt: input.updatedAt,
    grade: input.grade,
    aliases: input.aliases,
    segments: input.segments.map((segment) => {
      const segmentId = `${input.id}:segment:${segment.index}`;
      const legacyCards = segment.cards ?? (segment.sentences ? [segment.sentences] : []);
      return {
        id: segmentId,
        index: segment.index,
        hint: segment.hint,
        cards: legacyCards.map((legacyCard, cardIndex) => {
          const cardId = `${segmentId}:card:${cardIndex}`;
          return {
            id: cardId,
            sentences: legacyCard.map((sentence, sentenceIndex) =>
              toSentence(sentence, `${cardId}:sentence:${sentenceIndex}`)
            ),
          };
        }),
      };
    }),
  };
}

export interface PassageMeta {
  id: string;
  title: string;
  author: string;
  dynasty: string;
  grade?: string;
  aliases?: string[];
  charCount: number;
}

// ---------- 背诵进度（wenyan:progress） ----------

/** 三连阶段：1 挖空 / 2 首字 / 3 盲打 */
export type Phase = 1 | 2 | 3;

export interface SentenceState {
  phase: Phase;
  passed: boolean;
}

export interface GlobalPosition {
  passageId: string;
  segmentId: string;
  cardId: string;
  sentenceId: string;
}

export interface PassageProgress {
  /** 内容版本绑定；用于阻止旧进度被错误套用到新正文。 */
  contentVersion?: string;
  /** null means no formal passage position has been selected yet. */
  cursor: GlobalPosition | null;
  currentSegment: number;
  currentCardIndex: number;
  /** Durable whole-card mastery, keyed by stable card id, in the range 0..100. */
  cardMastery: Record<string, number>;
  sentenceStates: Record<string, SentenceState>; // key: `${segIdx}-${sentIdx}`
  cardBlindPassed: Record<string, boolean>;
  linkSnowballPassed: Record<string, boolean>;
  segmentSnowballPassed: Record<string, boolean>;
  snowballPassed: boolean[];
  fullTextCompleted: boolean;
  fullTextPassed: boolean;
  lastAttemptTime: string | null;
  bestPassedTime: number | null;
  bestTime: number;
  updatedAt: string;
}

export interface AttemptPosition {
  sentenceId: string;
  charIndex: number;
  expectedChar: string;
  count?: number;
}

export interface ExamAttempt {
  id: string;
  passageId: string;
  contentVersion: string;
  startedAt: string;
  completedAt: string | null;
  elapsedMs: number;
  passed: boolean;
  elapsedSeconds: number | null;
  wrongPositions: AttemptPosition[];
  timeoutPositions: AttemptPosition[];
  completed: boolean;
  settledAt: string | null;
}

// ---------- 错题本（wenyan:mistakes） ----------

export interface MistakeRecord {
  sentence: string;
  sentenceKey: string; // `${passageId}:${segIdx}-${sentIdx}`
  wrongChars: string[];
  wrongPositions: number[];
  timeoutPositions: number[];
  date: string; // YYYY-MM-DD 本地时区
  /** 同日同句的累计错误/停顿报告次数。 */
  count?: number;
  /** key 为句内汉字下标，value 为该位置累计按错次数。 */
  wrongCountByPosition?: Record<string, number>;
  contentVersion?: string;
  sentenceId?: string;
}

// ---------- 复习队列（wenyan:reviewQueue） ----------

export interface ReviewItem {
  id: string;
  /** Legacy scheduling field. Review is immediately available; this is kept only for migration/order fallback. */
  dueDate: string;
  status: 'pending' | 'completed';
  attempts: number;
  completedAt: string | null;
  passageId: string;
  /** The retrieval cue: normally the immediately preceding punctuation clause. */
  sentence: string;
  /** The complete punctuation clause the learner must recall. */
  answer: string;
  /** Legacy source sentence retained so old blank-filling tasks can be upgraded. */
  sourceSentence?: string;
  /** Error positions relative to the target clause (legacy items use source-sentence positions). */
  hiddenPositions: number[];
  sourceDate: string; // YYYY-MM-DD
  contentVersion?: string;
  /** Stable original Sentence id containing the target clause. */
  sentenceId?: string;
  /** Stable review identity inside a sentence, e.g. `${sentenceId}:clause:1`. */
  targetClauseId?: string;
  /** Han-character range inside the original Sentence, end-exclusive. */
  targetStartCharIndex?: number;
  targetEndCharIndex?: number;
  /** Global clause order inside the passage, used to avoid adjacent prompts in one group. */
  targetOrder?: number;
  promptType?: 'title' | 'previous-clause';
  reason?: 'mistake' | 'unreviewed' | 'legacy';
  /** Stored base priority; selection adds mistake/attempt/age signals. */
  priority?: number;
  mistakeCount?: number;
  createdAt?: string;
}

// ---------- 徽章（wenyan:badges） ----------

export interface BadgeStats {
  passedArticles: number;
  reviewDays: number;
  totalChars: number;
  streak: number;
}

export interface Badges {
  earned: string[];
  stats: BadgeStats;
}

// ---------- 学习列表（wenyan:learning，本期新增） ----------

/** 用户加入学习列表的篇目条目。 */
export interface LearningEntry {
  id: string;
  addedAt: string; // ISO 8601
}

// ---------- 盲打引擎类型（架构 §3.3.3，T03 引擎实现，本期仅定义） ----------

export interface BlindTarget {
  chars: string[]; // 仅汉字序列（去标点）
  puncts: (string | null)[]; // puncts[i] = 第 i 个汉字后跟的标点串
}

export interface BlindTypingState {
  chars: string[];
  puncts: (string | null)[];
  revealed: boolean[];
  cursor: number;
  errorFlag: boolean;
  timeoutPositions: number[];
  lastInputAt: number;
  done: boolean;
  elapsedMs: number;
}
