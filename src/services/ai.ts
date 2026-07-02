import type { GeminiLookupResult } from '../types/index';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ── Throttle ─────────────────────────────────────────────
const THROTTLE_MS = 3000;
let lastCallAt = 0;

export function getThrottleRemaining(): number {
  const elapsed = Date.now() - lastCallAt;
  return Math.max(0, THROTTLE_MS - elapsed);
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const remaining = getThrottleRemaining();
  if (remaining > 0) {
    throw new ThrottleError(remaining);
  }

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `API 錯誤 ${res.status}`);
  }

  lastCallAt = Date.now();

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return text;
}

// ── Lookup ────────────────────────────────────────────────
export async function lookupWord(
  apiKey: string,
  word: string
): Promise<GeminiLookupResult> {
  const prompt = `你是英語詞典助手，請查詢英文單字或片語「${word}」，嚴格以以下 JSON 格式回傳，不要加任何其他文字：
{
  "word": "原始字或片語（保持原輸入形式）",
  "translation": "繁體中文翻譯（簡潔）",
  "partOfSpeech": "詞性（noun / verb / adjective / adverb / phrase / idiom / other 其中一個）",
  "exampleSentence": "一個自然的英文例句",
  "exampleTranslation": "例句的繁體中文翻譯",
  "relatedInfo": [
    { "label": "類型說明", "content": "內容" }
  ]
}
relatedInfo 最多提供 3 項，選最實用的（詞形變化、常見搭配詞、片語動詞、固定表達等）。`;

  const text = await callGemini(apiKey, prompt);
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean) as GeminiLookupResult;
}

// ── Article Analysis ─────────────────────────────────────
export async function analyzeArticle(
  apiKey: string,
  article: string
): Promise<GeminiLookupResult[]> {
  const prompt = `你是英語詞彙分析師。請從以下英文文章中，找出 10～15 個 B2～C1 程度、對學習者最有價值的單字或片語。

規則：
- 排除 A1～B1 基礎詞彙（如 go、make、important 等常見簡單字）
- 優先選擇：動詞片語、學術詞彙、搭配詞、慣用語、進階形容詞／副詞
- 同一個詞出現多次只列一次
- 排除專有名詞（人名、地名、品牌等）
- 例句請直接從文章中引用或略微改寫，保留原文語境

文章：
"""
${article}
"""

嚴格以 JSON 陣列格式回傳，不要加任何其他文字：
[
  {
    "word": "單字或片語",
    "translation": "繁體中文翻譯（簡潔）",
    "partOfSpeech": "noun|verb|adjective|adverb|phrase|idiom|other",
    "exampleSentence": "從文章引用或改寫的英文例句",
    "exampleTranslation": "例句繁體中文翻譯",
    "relatedInfo": [
      { "label": "類型說明", "content": "內容" }
    ]
  }
]
relatedInfo 每筆最多 2 項，選最實用的（搭配詞、詞形變化、近義詞等）。`;

  const text = await callGemini(apiKey, prompt);
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean) as GeminiLookupResult[];
}

// ── Custom Error ──────────────────────────────────────────
export class ThrottleError extends Error {
  constructor(public remainingMs: number) {
    super(`請等待 ${Math.ceil(remainingMs / 1000)} 秒後再查詢`);
    this.name = 'ThrottleError';
  }
}
