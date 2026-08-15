const PHRASE_LIKE_POS = new Set(['phrase', 'idiom']);

export function isPhraseLike(partOfSpeech: string): boolean {
  return PHRASE_LIKE_POS.has(partOfSpeech.trim().toLowerCase());
}
