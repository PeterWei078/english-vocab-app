import type {
  VocabularyItem,
  AppSettings,
  LookupHistoryItem,
} from '../types/index';
import { isPhraseLike } from '../utils/pos';

const KEYS = {
  VOCAB: 'vocab_list',
  PHRASE: 'phrase_list',
  SETTINGS: 'settings',
  HISTORY: 'lookup_history',
} as const;

const PHRASE_MIGRATION_FLAG = 'phrase_migration_v1_done';
const PHRASE_MIGRATION_FLAG_V2 = 'phrase_migration_v2_done';
const PHRASE_MIGRATION_FLAG_V3 = 'phrase_migration_v3_done';

const MAX_HISTORY = 20;

// ── Generic list helpers ──────────────────────────────────
function loadItems(key: string): VocabularyItem[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as VocabularyItem[]) : [];
  } catch {
    return [];
  }
}

function saveItems(key: string, items: VocabularyItem[]): void {
  localStorage.setItem(key, JSON.stringify(items));
}

function addItem(key: string, item: VocabularyItem): void {
  const list = loadItems(key);
  const existing = list.findIndex((v) => v.id === item.id);
  if (existing !== -1) {
    list[existing] = item;
  } else {
    list.unshift(item);
  }
  saveItems(key, list);
}

function updateItem(
  key: string,
  id: string,
  patch: Partial<VocabularyItem>
): void {
  const list = loadItems(key);
  const idx = list.findIndex((v) => v.id === id);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...patch };
    saveItems(key, list);
  }
}

function deleteItem(key: string, id: string): void {
  saveItems(key, loadItems(key).filter((v) => v.id !== id));
}

function itemExists(key: string, word: string): boolean {
  return loadItems(key).some(
    (v) => v.word.toLowerCase() === word.toLowerCase()
  );
}

// ── Vocab ──────────────────────────────────────────────────
export function loadVocab(): VocabularyItem[] {
  return loadItems(KEYS.VOCAB);
}

export function saveVocab(items: VocabularyItem[]): void {
  saveItems(KEYS.VOCAB, items);
}

export function addVocabItem(item: VocabularyItem): void {
  addItem(KEYS.VOCAB, item);
}

export function updateVocabItem(
  id: string,
  patch: Partial<VocabularyItem>
): void {
  updateItem(KEYS.VOCAB, id, patch);
}

export function deleteVocabItem(id: string): void {
  deleteItem(KEYS.VOCAB, id);
}

export function wordExists(word: string): boolean {
  return itemExists(KEYS.VOCAB, word);
}

// ── Phrase ─────────────────────────────────────────────────
export function loadPhrases(): VocabularyItem[] {
  return loadItems(KEYS.PHRASE);
}

export function savePhrases(items: VocabularyItem[]): void {
  saveItems(KEYS.PHRASE, items);
}

export function addPhraseItem(item: VocabularyItem): void {
  addItem(KEYS.PHRASE, item);
}

export function updatePhraseItem(
  id: string,
  patch: Partial<VocabularyItem>
): void {
  updateItem(KEYS.PHRASE, id, patch);
}

export function deletePhraseItem(id: string): void {
  deleteItem(KEYS.PHRASE, id);
}

export function phraseExists(word: string): boolean {
  return itemExists(KEYS.PHRASE, word);
}

// ── Lookup-result routing (word vs. phrase/idiom) ────────────
export function addVocabOrPhraseItem(item: VocabularyItem): void {
  if (isPhraseLike(item.partOfSpeech)) {
    addPhraseItem(item);
  } else {
    addVocabItem(item);
  }
}

export function vocabOrPhraseExists(
  word: string,
  partOfSpeech: string
): boolean {
  return isPhraseLike(partOfSpeech) ? phraseExists(word) : wordExists(word);
}

// ── One-time migration: move existing phrase/idiom items ────
// out of the word list (vocab_list) into the new phrase list.
export function migratePhraseItemsIfNeeded(): void {
  if (localStorage.getItem(PHRASE_MIGRATION_FLAG)) return;

  const vocab = loadVocab();
  const toMove = vocab.filter((v) => isPhraseLike(v.partOfSpeech));

  if (toMove.length) {
    saveVocab(vocab.filter((v) => !isPhraseLike(v.partOfSpeech)));
    savePhrases([...toMove, ...loadPhrases()]);
  }

  localStorage.setItem(PHRASE_MIGRATION_FLAG, '1');
}

// ── One-time migration: move existing "phrasal verb" items that
// were saved into vocab_list before it counted as phrase-like.
export function migratePhrasalVerbsIfNeeded(): void {
  if (localStorage.getItem(PHRASE_MIGRATION_FLAG_V2)) return;

  const vocab = loadVocab();
  const toMove = vocab.filter((v) => isPhraseLike(v.partOfSpeech));

  if (toMove.length) {
    saveVocab(vocab.filter((v) => !isPhraseLike(v.partOfSpeech)));
    savePhrases([...toMove, ...loadPhrases()]);
  }

  localStorage.setItem(PHRASE_MIGRATION_FLAG_V2, '1');
}

// ── One-time migration: move existing "noun phrase" items that
// were saved into vocab_list before it counted as phrase-like.
export function migrateNounPhrasesIfNeeded(): void {
  if (localStorage.getItem(PHRASE_MIGRATION_FLAG_V3)) return;

  const vocab = loadVocab();
  const toMove = vocab.filter((v) => isPhraseLike(v.partOfSpeech));

  if (toMove.length) {
    saveVocab(vocab.filter((v) => !isPhraseLike(v.partOfSpeech)));
    savePhrases([...toMove, ...loadPhrases()]);
  }

  localStorage.setItem(PHRASE_MIGRATION_FLAG_V3, '1');
}

export function clearAllTags(): void {
  saveVocab(loadVocab().map((v) => ({ ...v, tags: [] })));
  savePhrases(loadPhrases().map((v) => ({ ...v, tags: [] })));
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
    {
      version: 2,
      exportedAt: Date.now(),
      vocab: loadVocab(),
      phrase: loadPhrases(),
    },
    null,
    2
  );
}

function mergeList(
  existing: VocabularyItem[],
  incoming: VocabularyItem[]
): { merged: VocabularyItem[]; addedCount: number } {
  const existingIds = new Set(existing.map((v) => v.id));
  const newItems = incoming.filter((v) => !existingIds.has(v.id));
  return { merged: [...newItems, ...existing], addedCount: newItems.length };
}

export function importVocabJson(
  json: string,
  mode: 'merge' | 'replace'
): number {
  const parsed = JSON.parse(json) as {
    vocab?: VocabularyItem[];
    phrase?: VocabularyItem[];
  };
  const incomingVocab: VocabularyItem[] = Array.isArray(parsed.vocab)
    ? parsed.vocab
    : Array.isArray(parsed)
    ? (parsed as unknown as VocabularyItem[])
    : [];
  // Older backups (v1) predate the phrase library and have no `phrase`
  // key — leave the existing phrase list untouched in that case rather
  // than wiping it out on replace.
  const hasPhraseField = Array.isArray(parsed.phrase);
  const incomingPhrase: VocabularyItem[] = hasPhraseField ? parsed.phrase! : [];

  if (mode === 'replace') {
    saveVocab(incomingVocab);
    if (hasPhraseField) savePhrases(incomingPhrase);
    return incomingVocab.length + incomingPhrase.length;
  }

  // merge: skip duplicates by id
  const vocabResult = mergeList(loadVocab(), incomingVocab);
  saveVocab(vocabResult.merged);

  let addedPhraseCount = 0;
  if (hasPhraseField) {
    const phraseResult = mergeList(loadPhrases(), incomingPhrase);
    savePhrases(phraseResult.merged);
    addedPhraseCount = phraseResult.addedCount;
  }

  return vocabResult.addedCount + addedPhraseCount;
}

// ── Clear All ─────────────────────────────────────────────
export function clearAllData(): void {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem(PHRASE_MIGRATION_FLAG);
  localStorage.removeItem(PHRASE_MIGRATION_FLAG_V2);
  localStorage.removeItem(PHRASE_MIGRATION_FLAG_V3);
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
    { key: KEYS.PHRASE,   label: '片語庫' },
    { key: KEYS.SETTINGS, label: '設定' },
    { key: KEYS.HISTORY,  label: '查詢歷史' },
  ].map(({ key, label }) => {
    const val = localStorage.getItem(key) ?? '';
    return { key, label, bytes: val.length * 2 }; // UTF-16: 2 bytes per char
  });

  const usedBytes = breakdown.reduce((sum, b) => sum + b.bytes, 0);
  return { totalBytes: STORAGE_TOTAL_BYTES, usedBytes, breakdown };
}
