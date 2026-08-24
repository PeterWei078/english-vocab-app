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
- exampleSentence 必須是一個完整、文法正確的英文句子（至少包含主詞與動詞），且句子中要包含該單字或片語本身；絕對不可只重複該單字或片語本身當例句
- 若文章中該詞所在的句子太短、太片段或不適合單獨引用，請改寫或另外造一個能清楚示範用法的完整句子，不要直接照抄詞語本身
- exampleTranslation 必須是 exampleSentence 整句的繁體中文翻譯，不可只翻譯單字本身
- 即使一次要產出多筆，每一筆的完整度（例句、翻譯、relatedInfo）都必須跟只查詢單一個詞時一樣詳細，不可因為數量多而簡化或偷懶

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
    "exampleSentence": "包含該詞的完整英文例句（可從文章改寫，但必須是完整句子）",
    "exampleTranslation": "exampleSentence 整句的繁體中文翻譯",
    "relatedInfo": [
      { "label": "類型說明", "content": "內容" }
    ]
  }
]
relatedInfo 每筆最多 3 項，選最實用的（搭配詞、詞形變化、近義詞、片語動詞、固定表達等）。`;

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
