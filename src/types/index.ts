export interface RelatedInfo {
  label: string;
  content: string;
}

export type MasteryLevel = 'unfamiliar' | 'okay' | 'familiar';

export interface VocabularyItem {
  id: string;
  word: string;
  translation: string;
  partOfSpeech: string;
  exampleSentence: string;
  exampleTranslation: string;
  relatedInfo: RelatedInfo[];
  tags: string[];
  isPinned: boolean;
  createdAt: number;
  masteryLevel: MasteryLevel;
}

export type Theme = 'light' | 'dark' | 'auto';

export interface AppSettings {
  geminiApiKey: string;
  theme: Theme;
}

export interface LookupHistoryItem {
  word: string;
  translation: string;
  timestamp: number;
}

export type SortMode =
  | 'newest'
  | 'alpha'
  | 'random'
  | 'unfamiliar'
  | 'okay'
  | 'familiar';

export interface GeminiLookupResult {
  word: string;
  translation: string;
  partOfSpeech: string;
  exampleSentence: string;
  exampleTranslation: string;
  relatedInfo: RelatedInfo[];
}
