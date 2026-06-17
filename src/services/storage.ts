import type {
  VocabularyItem,
  QuizData,
  AppSettings,
  LookupHistoryItem,
} from '../types/index';

const KEYS = {
  VOCAB: 'vocab_list',
  QUIZ: 'quiz_data',
  SETTINGS: 'settings',
  HISTORY: 'lookup_history',
} as const;

const MAX_HISTORY = 20;

// ── Vocab ──────────────────────────────────────────────────
export function loadVocab(): VocabularyItem[] {
  try {
    const raw = localStorage.getItem(KEYS.VOCAB);
    return raw ? (JSON.parse(raw) as VocabularyItem[]) : [];
  } catch {
    return [];
  }
}

export function saveVocab(items: VocabularyItem[]): void {
  localStorage.setItem(KEYS.VOCAB, JSON.stringify(items));
}

export function addVocabItem(item: VocabularyItem): void {
  const list = loadVocab();
  const existing = list.findIndex((v) => v.id === item.id);
  if (existing !== -1) {
    list[existing] = item;
  } else {
    list.unshift(item);
  }
  saveVocab(list);
}

export function updateVocabItem(
  id: string,
  patch: Partial<VocabularyItem>
): void {
  const list = loadVocab();
  const idx = list.findIndex((v) => v.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...patch };
    saveVocab(list);
  }
}

export function deleteVocabItem(id: string): void {
  saveVocab(loadVocab().filter((v) => v.id !== id));
}

export function wordExists(word: string): boolean {
  return loadVocab().some(
    (v) => v.word.toLowerCase() === word.toLowerCase()
  );
}

// ── Quiz ──────────────────────────────────────────────────
export function loadQuizData(): QuizData | null {
  try {
    const raw = localStorage.getItem(KEYS.QUIZ);
    return raw ? (JSON.parse(raw) as QuizData) : null;
  } catch {
    return null;
  }
}

export function saveQuizData(data: QuizData): void {
  localStorage.setItem(KEYS.QUIZ, JSON.stringify(data));
}

// ── Settings ──────────────────────────────────────────────
const DEFAULT_SETTINGS: AppSettings = {
  geminiApiKey: '',
  theme: 'auto',
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEYS.SETTINGS);
    return raw
      ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) }
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
}

// ── Lookup History ────────────────────────────────────────
export function loadHistory(): LookupHistoryItem[] {
  try {
    const raw = localStorage.getItem(KEYS.HISTORY);
    return raw ? (JSON.parse(raw) as LookupHistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function pushHistory(item: LookupHistoryItem): void {
  const history = loadHistory().filter(
    (h) => h.word.toLowerCase() !== item.word.toLowerCase()
  );
  history.unshift(item);
  localStorage.setItem(
    KEYS.HISTORY,
    JSON.stringify(history.slice(0, MAX_HISTORY))
  );
}

export function clearHistory(): void {
  localStorage.removeItem(KEYS.HISTORY);
}

// ── Export / Import ───────────────────────────────────────
export function exportVocabJson(): string {
  return JSON.stringify(
    { version: 1, exportedAt: Date.now(), vocab: loadVocab() },
    null,
    2
  );
}

export function importVocabJson(
  json: string,
  mode: 'merge' | 'replace'
): number {
  const parsed = JSON.parse(json) as { vocab?: VocabularyItem[] };
  const incoming: VocabularyItem[] = Array.isArray(parsed.vocab)
    ? parsed.vocab
    : Array.isArray(parsed)
    ? (parsed as unknown as VocabularyItem[])
    : [];

  if (mode === 'replace') {
    saveVocab(incoming);
    return incoming.length;
  }

  // merge: skip duplicates by id
  const existing = loadVocab();
  const existingIds = new Set(existing.map((v) => v.id));
  const newItems = incoming.filter((v) => !existingIds.has(v.id));
  saveVocab([...newItems, ...existing]);
  return newItems.length;
}

// ── Clear All ─────────────────────────────────────────────
export function clearAllData(): void {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}

// ── Storage Usage ─────────────────────────────────────────
export interface StorageBreakdown {
  key: string;
  label: string;
  bytes: number;
}

export interface StorageUsage {
  totalBytes: number;
  usedBytes: number;
  breakdown: StorageBreakdown[];
}

const STORAGE_TOTAL_BYTES = 5 * 1024 * 1024; // 5MB standard browser limit

export function getStorageUsage(): StorageUsage {
  const breakdown: StorageBreakdown[] = [
    { key: KEYS.VOCAB,    label: '單字庫' },
    { key: KEYS.QUIZ,     label: '測驗資料' },
    { key: KEYS.SETTINGS, label: '設定' },
    { key: KEYS.HISTORY,  label: '查詢歷史' },
  ].map(({ key, label }) => {
    const val = localStorage.getItem(key) ?? '';
    return { key, label, bytes: val.length * 2 }; // UTF-16: 2 bytes per char
  });

  const usedBytes = breakdown.reduce((sum, b) => sum + b.bytes, 0);
  return { totalBytes: STORAGE_TOTAL_BYTES, usedBytes, breakdown };
}
