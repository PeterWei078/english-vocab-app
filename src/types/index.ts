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

export type QuizQuestionType = 'multiple-choice' | 'fill-blank' | 'zh-to-en';

export interface QuizQuestion {
  type: QuizQuestionType;
  word: string;
  question: string;
  options?: string[];
  answer: string;
  explanation: string;
}

export interface QuizData {
  questions: QuizQuestion[];
  generatedAt: number;
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

export type QuizScope = 'all' | 'unfamiliar' | 'filtered';

export interface GeminiLookupResult {
  word: string;
  translation: string;
  partOfSpeech: string;
  exampleSentence: string;
  exampleTranslation: string;
  relatedInfo: RelatedInfo[];
  tags: string[];
}
