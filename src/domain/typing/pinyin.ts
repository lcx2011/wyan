import { pinyin } from 'pinyin-pro';

const HAN_RE = /\p{Script=Han}/u;

function firstLetter(reading: string): string | undefined {
  const normalized = reading
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  const initial = normalized.match(/[a-z]/u)?.[0];
  return initial;
}

function apiTokens(apiPinyin: string): string[] {
  return apiPinyin
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .match(/[a-züv]+[1-5]?/giu) ?? [];
}

function fallbackInitials(character: string): string[] {
  const readings = pinyin(character, { type: 'all', multiple: true });
  const initials = readings.flatMap((reading) => {
    const alternatives = reading.polyphonic.length > 0 ? reading.polyphonic : [reading.pinyin];
    return alternatives.map(firstLetter).filter((initial): initial is string => initial !== undefined);
  });
  return [...new Set(initials)];
}

/**
 * Returns accepted first-letter sets for Han characters only. API pinyin is used
 * only when its tokens align one-to-one with the Han-character sequence.
 */
export function acceptedInitials(text: string, apiPinyin?: string): string[][] {
  const hanCharacters = Array.from(text).filter((character) => HAN_RE.test(character));
  const apiInitials = apiPinyin ? apiTokens(apiPinyin).map(firstLetter) : [];
  if (apiInitials.length === hanCharacters.length && apiInitials.every(Boolean)) {
    return hanCharacters.map((character, index) => [
      ...new Set([apiInitials[index] as string, ...fallbackInitials(character)]),
    ]);
  }
  return hanCharacters.map(fallbackInitials);
}
