import type { Sentence } from '../../types';

const HAN_CHARACTER = /[\u3400-\u9fff]/u;

/** A durable sentence-relative location for mistakes and pauses. */
export interface TypingPosition {
  sentenceId: string;
  charIndex: number;
  expectedChar: string;
}

/** A flattened input target. Punctuation belongs to the preceding Han slot. */
export interface TypingTarget {
  chars: string[];
  puncts: string[];
  acceptedInitials: string[][];
  /** End-exclusive flattened character indexes, one for each source sentence. */
  sentenceBoundaries: number[];
  positions: TypingPosition[];
}

/** Copies every mutable collection so an engine attempt never aliases caller-owned target data. */
export function cloneTarget(target: TypingTarget): TypingTarget {
  if (
    target.chars.length !== target.puncts.length ||
    target.chars.length !== target.acceptedInitials.length ||
    target.chars.length !== target.positions.length
  ) {
    throw new Error('TypingTarget slots must align');
  }
  if (target.acceptedInitials.some((initials) => initials.length === 0 || initials.some((initial) => !/^[A-Za-z]$/.test(initial)))) {
    throw new Error('acceptedInitials must contain ASCII initials');
  }
  return {
    chars: [...target.chars],
    puncts: [...target.puncts],
    acceptedInitials: target.acceptedInitials.map((initials) => initials.map((initial) => initial.toLowerCase())),
    sentenceBoundaries: [...target.sentenceBoundaries],
    positions: target.positions.map((position) => ({ ...position })),
  };
}

/** Copies durable locations when passing them across a public state boundary. */
export function clonePosition(position: TypingPosition): TypingPosition {
  return { ...position };
}

/**
 * Flattens sentences into Han-character input slots while retaining enough
 * sentence-local identity to persist mistakes across target reconstruction.
 */
export function buildTarget(sentences: readonly Sentence[]): TypingTarget {
  const chars: string[] = [];
  const puncts: string[] = [];
  const acceptedInitials: string[][] = [];
  const sentenceBoundaries: number[] = [];
  const positions: TypingPosition[] = [];

  for (const sentence of sentences) {
    const sentenceStart = chars.length;
    const hanCharacters = Array.from(sentence.text).filter((character) => HAN_CHARACTER.test(character));
    if (sentence.acceptedInitials.length !== hanCharacters.length) {
      throw new Error(`acceptedInitials must align with Han slots for sentence ${sentence.id}`);
    }

    let charIndex = 0;
    for (const character of Array.from(sentence.text)) {
      if (HAN_CHARACTER.test(character)) {
        const initials = sentence.acceptedInitials[charIndex];
        if (initials.length === 0 || initials.some((initial) => !/^[A-Za-z]$/.test(initial))) {
          throw new Error(`acceptedInitials must contain ASCII initials for sentence ${sentence.id}`);
        }
        chars.push(character);
        puncts.push('');
        acceptedInitials.push(initials.map((initial) => initial.toLowerCase()));
        positions.push({ sentenceId: sentence.id, charIndex, expectedChar: character });
        charIndex += 1;
      } else if (chars.length > sentenceStart) {
        puncts[puncts.length - 1] += character;
      }
    }
    sentenceBoundaries.push(chars.length);
  }

  return { chars, puncts, acceptedInitials, sentenceBoundaries, positions };
}
