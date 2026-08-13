import type { Passage, Sentence } from '../../types';
import { isHan } from '../../utils/text';

const REVIEW_BREAKS = new Set(['，', '。', '；', '！', '？', '：', ',', '.', ';', '!', '?', ':']);
const CLOSING_PUNCTUATION = new Set(['”', '’', '」', '』', '》', '】', ')', '）']);

export interface ReviewClause {
  id: string;
  passageId: string;
  sentenceId: string;
  text: string;
  /** Han-character offsets inside the owning Sentence, end-exclusive. */
  startCharIndex: number;
  endCharIndex: number;
  sentenceClauseIndex: number;
  order: number;
  prompt: string;
  promptType: 'title' | 'previous-clause';
}

interface LocalClause {
  text: string;
  startCharIndex: number;
  endCharIndex: number;
  sentenceClauseIndex: number;
}

/**
 * Splits one stored Sentence into punctuation clauses for retrieval practice.
 * Commas/periods/semicolons/colons split; enumeration commas (`、`) do not.
 * Closing quotes stay attached to the punctuation immediately before them.
 */
export function splitReviewClauses(sentence: Sentence): LocalClause[] {
  const characters = Array.from(sentence.text);
  const clauses: LocalClause[] = [];
  let start = 0;
  let startHan = 0;
  let hanCount = 0;

  const push = (end: number) => {
    const text = characters.slice(start, end).join('').trim();
    const endHan = hanCount;
    if (text !== '' && endHan > startHan) {
      clauses.push({
        text,
        startCharIndex: startHan,
        endCharIndex: endHan,
        sentenceClauseIndex: clauses.length,
      });
    }
    start = end;
    startHan = endHan;
  };

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    if (isHan(character)) hanCount += 1;
    if (!REVIEW_BREAKS.has(character)) continue;

    let end = index + 1;
    while (end < characters.length && CLOSING_PUNCTUATION.has(characters[end])) end += 1;
    push(end);
    index = end - 1;
  }
  if (start < characters.length) push(characters.length);
  return clauses;
}

function passageSentences(passage: Passage): Sentence[] {
  return passage.segments.flatMap((segment) =>
    segment.cards.flatMap((card) => card.sentences),
  );
}

/** Flattens a passage to stable cue→target review clauses in reading order. */
export function buildReviewClauses(passage: Passage): ReviewClause[] {
  const local = passageSentences(passage).flatMap((sentence) =>
    splitReviewClauses(sentence).map((clause) => ({ sentence, clause })),
  );

  return local.map(({ sentence, clause }, order) => {
    const previous = local[order - 1]?.clause;
    return {
      id: `${sentence.id}:clause:${clause.sentenceClauseIndex}`,
      passageId: passage.id,
      sentenceId: sentence.id,
      text: clause.text,
      startCharIndex: clause.startCharIndex,
      endCharIndex: clause.endCharIndex,
      sentenceClauseIndex: clause.sentenceClauseIndex,
      order,
      prompt: previous?.text ?? passage.title,
      promptType: previous ? 'previous-clause' : 'title',
    };
  });
}

export function clausesForSentence(passage: Passage, sentenceId: string): ReviewClause[] {
  return buildReviewClauses(passage).filter((clause) => clause.sentenceId === sentenceId);
}

