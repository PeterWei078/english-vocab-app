const PHRASE_LIKE_POS = new Set(['phrase', 'idiom', 'phrasal verb', 'phrasal-verb']);

export function isPhraseLike(partOfSpeech: string): boolean {
  return PHRASE_LIKE_POS.has(partOfSpeech.trim().toLowerCase());
}
