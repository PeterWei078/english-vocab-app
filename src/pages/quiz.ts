import type { VocabularyItem, MasteryLevel } from '../types/index';
import { loadVocab, loadPhrases, updateVocabItem, updatePhraseItem } from '../services/storage';
import { speak } from '../services/speech';

type QuizScope = 'all' | 'unfamiliar' | 'okay';
type QuizSource = 'vocab' | 'phrase' | 'all';
type CardOrigin = 'vocab' | 'phrase';

interface QuizCard {
  item: VocabularyItem;
  origin: CardOrigin;
}

function loadBySource(source: QuizSource): QuizCard[] {
  const vocabCards: QuizCard[] = loadVocab().map((item) => ({ item, origin: 'vocab' as const }));
  const phraseCards: QuizCard[] = loadPhrases().map((item) => ({ item, origin: 'phrase' as const }));

  if (source === 'vocab') return vocabCards;
  if (source === 'phrase') return phraseCards;
  return [...vocabCards, ...phraseCards];
}

const MASTERY_CONFIG: Record<MasteryLevel, { label: string; icon: string }> = {
  unfamiliar: { label: '不熟', icon: '🔴' },
  okay:       { label: '尚可', icon: '🟡' },
  familiar:   { label: '熟悉', icon: '🟢' },
};

const MASTERY_ORDER: MasteryLevel[] = ['familiar', 'okay', 'unfamiliar'];

interface QuizState {
  source: QuizSource;
  cards: QuizCard[];
  currentIndex: number;
  revealed: boolean;
  results: Array<{ card: QuizCard; level: MasteryLevel }>;
}

let state: QuizState | null = null;
let currentSource: QuizSource = 'all';
let currentLimit: number | 'all' = 'all';

const LIMIT_OPTIONS: Array<number | 'all'> = [10, 20, 30, 50, 'all'];

export function renderQuizPage(container: HTMLElement): void {
  state = null;
  renderSetup(container);
}

// ── Setup Screen ────────────────────────────────────────────
function renderSetup(container: HTMLElement): void {
  const cards = loadBySource(currentSource);
  const unfamiliar = cards.filter((c) => c.item.masteryLevel === 'unfamiliar');
  const okay = cards.filter((c) => c.item.masteryLevel === 'okay');

  const vocabTotal = loadVocab().length;
  const phraseTotal = loadPhrases().length;

  container.innerHTML = `
    <div class="page">
      <div class="quiz-setup">
        <div class="page-header">
          <h1 class="page-title">閃卡測驗</h1>
          <p class="page-subtitle">看單字/片語回想意思，翻開答案自我評分</p>
        </div>

        ${
          vocabTotal + phraseTotal === 0
            ? `<div class="card" style="text-align:center;color:var(--text-secondary)">
                <div style="font-size:40px;margin-bottom:12px">📚</div>
                <p style="font-weight:600">單字庫和片語庫都還是空的，先去查詢並收藏吧</p>
               </div>`
            : `<div class="card">
                <div class="form-group">
                  <label class="label">測驗來源</label>
                  <select id="source-select" class="select">
                    <option value="all">📚🧩 全部（${vocabTotal + phraseTotal} 個）</option>
                    <option value="vocab" ${vocabTotal === 0 ? 'disabled' : ''}>📚 單字庫（${vocabTotal} 個）</option>
                    <option value="phrase" ${phraseTotal === 0 ? 'disabled' : ''}>🧩 片語庫（${phraseTotal} 個）</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="label">測驗範圍</label>
                  <select id="scope-select" class="select">
                    <option value="all">全部（${cards.length} 個）</option>
                    <option value="unfamiliar" ${unfamiliar.length === 0 ? 'disabled' : ''}>
                      🔴 不熟的（${unfamiliar.length} 個）
                    </option>
                    <option value="okay" ${okay.length === 0 ? 'disabled' : ''}>
                      🟡 尚可的（${okay.length} 個）
                    </option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="label">測驗題數</label>
                  <select id="limit-select" class="select"></select>
                </div>

                <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
                  <input type="checkbox" id="shuffle-check" checked style="width:16px;height:16px" />
                  <label for="shuffle-check" style="font-size:13px;color:var(--text-secondary)">隨機排序</label>
                </div>

                <button id="start-quiz-btn" class="btn btn-primary btn-full btn-lg" ${cards.length === 0 ? 'disabled' : ''}>
                  🎯 開始測驗
                </button>
               </div>`
        }
      </div>
    </div>
  `;

  const sourceSelect = container.querySelector<HTMLSelectElement>('#source-select');
  if (sourceSelect) {
    sourceSelect.value = currentSource;
    sourceSelect.addEventListener('change', () => {
      currentSource = sourceSelect.value as QuizSource;
      renderSetup(container);
    });
  }

  const scopeSelect = container.querySelector<HTMLSelectElement>('#scope-select');
  const limitSelect = container.querySelector<HTMLSelectElement>('#limit-select');

  const scopeCount = (scope: QuizScope): number =>
    scope === 'unfamiliar' ? unfamiliar.length : scope === 'okay' ? okay.length : cards.length;

  const populateLimitSelect = (): void => {
    if (!limitSelect || !scopeSelect) return;
    const total = scopeCount(scopeSelect.value as QuizScope);
    limitSelect.innerHTML = LIMIT_OPTIONS.map((opt) =>
      opt === 'all'
        ? `<option value="all">全部（${total} 個）</option>`
        : `<option value="${opt}" ${opt >= total ? 'disabled' : ''}>${opt} 題</option>`
    ).join('');
    const wanted = currentLimit === 'all' || currentLimit >= total ? 'all' : String(currentLimit);
    limitSelect.value = wanted;
    if (limitSelect.value !== wanted) limitSelect.value = 'all';
  };

  populateLimitSelect();

  scopeSelect?.addEventListener('change', populateLimitSelect);
  limitSelect?.addEventListener('change', () => {
    currentLimit = limitSelect.value === 'all' ? 'all' : Number(limitSelect.value);
  });

  container.querySelector('#start-quiz-btn')?.addEventListener('click', () => {
    const scope = (scopeSelect?.value ?? 'all') as QuizScope;
    const shuffle = container.querySelector<HTMLInputElement>('#shuffle-check')?.checked ?? true;
    const limit = limitSelect?.value === 'all' ? 'all' : Number(limitSelect?.value ?? 'all');
    startQuiz(scope, shuffle, limit, container);
  });
}

function startQuiz(scope: QuizScope, shuffle: boolean, limit: number | 'all', container: HTMLElement): void {
  const all = loadBySource(currentSource);
  let cards =
    scope === 'unfamiliar'
      ? all.filter((c) => c.item.masteryLevel === 'unfamiliar')
      : scope === 'okay'
      ? all.filter((c) => c.item.masteryLevel === 'okay')
      : all;

  if (cards.length === 0) {
    renderSetup(container);
    return;
  }

  if (shuffle) {
    cards = [...cards];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
  }

  if (limit !== 'all' && limit < cards.length) {
    cards = cards.slice(0, limit);
  }

  state = { source: currentSource, cards, currentIndex: 0, revealed: false, results: [] };
  renderCard(container);
}

// ── Flashcard Screen ─────────────────────────────────────────
function renderCard(container: HTMLElement): void {
  if (!state) return;

  const { cards, currentIndex } = state;
  const item = cards[currentIndex].item;
  const progress = ((currentIndex + 1) / cards.length) * 100;
  state.revealed = false;

  container.innerHTML = `
    <div class="page">
      <div class="quiz-question-area">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:13px;color:var(--text-muted)">第 ${currentIndex + 1} 張 / 共 ${cards.length} 張</span>
        </div>
        <div class="quiz-progress-bar">
          <div class="quiz-progress-fill" style="width:${progress}%"></div>
        </div>

        <div class="card" id="flashcard" style="text-align:center;min-height:200px;display:flex;flex-direction:column;justify-content:center">
          <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">${escHtml(item.partOfSpeech)}</div>
          <div style="font-size:32px;font-weight:800;margin-bottom:16px">
            ${escHtml(item.word)}
            <button id="speak-word-btn" class="btn-icon" style="vertical-align:middle" title="朗讀單字">🔊</button>
          </div>
          <div id="answer-area"></div>
        </div>

        <div id="action-area" style="margin-top:16px"></div>
      </div>
    </div>
  `;

  container.querySelector('#speak-word-btn')?.addEventListener('click', () => speak(item.word));

  const actionArea = container.querySelector<HTMLElement>('#action-area')!;
  actionArea.innerHTML = `<button id="reveal-btn" class="btn btn-primary btn-full btn-lg">🔍 顯示答案</button>`;
  actionArea.querySelector('#reveal-btn')!.addEventListener('click', () => revealAnswer(container));
}

function revealAnswer(container: HTMLElement): void {
  if (!state || state.revealed) return;
  state.revealed = true;

  const item = state.cards[state.currentIndex].item;
  const answerArea = container.querySelector<HTMLElement>('#answer-area')!;

  const relatedHtml = item.relatedInfo.length
    ? `<div class="vocab-related" style="text-align:left;margin-top:12px">
        ${item.relatedInfo
          .map(
            (r) =>
              `<div class="vocab-related-item"><span class="vocab-related-label">${escHtml(r.label)}：</span><span class="vocab-related-content">${escHtml(r.content)}</span></div>`
          )
          .join('')}
       </div>`
    : '';

  const tagsHtml = item.tags.length
    ? `<div class="tags" style="justify-content:center;margin-top:10px">
        ${item.tags.map((t) => `<span class="tag">${escHtml(t)}</span>`).join('')}
       </div>`
    : '';

  answerArea.innerHTML = `
    <hr style="border:none;border-top:1px solid var(--border);margin:16px 0" />
    <div style="font-size:20px;font-weight:700;color:var(--accent);margin-bottom:12px">${escHtml(item.translation)}</div>
    <div class="vocab-example" style="text-align:left">"${escHtml(item.exampleSentence)}"
      <button id="speak-example-btn" class="btn-icon" style="display:inline-flex;width:24px;height:24px;font-size:14px;vertical-align:middle" title="朗讀例句">🔊</button>
    </div>
    <div class="vocab-example-translation" style="text-align:left">${escHtml(item.exampleTranslation)}</div>
    ${relatedHtml}
    ${tagsHtml}
  `;

  answerArea.querySelector('#speak-example-btn')?.addEventListener('click', () => speak(item.exampleSentence, 0.85));

  const actionArea = container.querySelector<HTMLElement>('#action-area')!;
  actionArea.innerHTML = `
    <div style="font-size:13px;color:var(--text-secondary);text-align:center;margin-bottom:8px">你對這個字的熟悉程度？</div>
    <div class="mastery-selector"></div>
  `;
  const selector = actionArea.querySelector<HTMLElement>('.mastery-selector')!;
  MASTERY_ORDER.forEach((level) => {
    const { icon, label } = MASTERY_CONFIG[level];
    const btn = document.createElement('button');
    btn.className = `mastery-option ${level}`;
    btn.textContent = `${icon} ${label}`;
    btn.addEventListener('click', () => rateCard(level, container));
    selector.appendChild(btn);
  });
}

function rateCard(level: MasteryLevel, container: HTMLElement): void {
  if (!state) return;

  const card = state.cards[state.currentIndex];
  if (card.origin === 'phrase') {
    updatePhraseItem(card.item.id, { masteryLevel: level });
  } else {
    updateVocabItem(card.item.id, { masteryLevel: level });
  }
  state.results.push({ card, level });

  if (state.currentIndex === state.cards.length - 1) {
    renderResult(container);
  } else {
    state.currentIndex++;
    renderCard(container);
  }
}

// ── Result Screen ────────────────────────────────────────────
function renderResult(container: HTMLElement): void {
  if (!state) return;

  const { results, source } = state;
  const counts: Record<MasteryLevel, number> = { familiar: 0, okay: 0, unfamiliar: 0 };
  results.forEach((r) => counts[r.level]++);

  const summaryHtml = MASTERY_ORDER.map((level) => {
    const { icon, label } = MASTERY_CONFIG[level];
    return `
      <div style="flex:1;text-align:center">
        <div style="font-size:28px;font-weight:800">${counts[level]}</div>
        <div style="font-size:13px;color:var(--text-secondary)">${icon} ${label}</div>
      </div>`;
  }).join('');

  const unfamiliarItems = results.filter((r) => r.level === 'unfamiliar');
  const reviewHtml = unfamiliarItems.length
    ? unfamiliarItems
        .map(
          (r) => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border)">
          <div style="font-weight:600">${escHtml(r.card.item.word)}</div>
          <div style="font-size:13px;color:var(--text-secondary)">${escHtml(r.card.item.translation)}</div>
        </div>`
        )
        .join('')
    : '';

  const backHash = source === 'phrase' ? '#phrases' : '#vocabulary';
  const backLabel = source === 'phrase' ? '回片語庫' : '回單字庫';

  container.innerHTML = `
    <div class="page">
      <div class="quiz-setup">
        <div class="card" style="text-align:center;margin-bottom:20px">
          <div style="font-size:48px;margin-bottom:12px">🎉</div>
          <div style="font-size:18px;font-weight:700;margin-bottom:16px">複習完成！共 ${results.length} 張卡片</div>
          <div style="display:flex;gap:8px">${summaryHtml}</div>
        </div>

        ${
          unfamiliarItems.length
            ? `<div class="card">
                <h3 style="font-size:15px;font-weight:700;margin-bottom:8px">🔴 標記為不熟的（${unfamiliarItems.length} 個）</h3>
                ${reviewHtml}
               </div>`
            : ''
        }

        <div style="display:flex;gap:10px;margin-top:20px">
          <button id="retry-btn" class="btn btn-primary btn-full">再測一次</button>
          <button id="vocab-btn" class="btn btn-secondary btn-full" onclick="location.hash='${backHash}'">${backLabel}</button>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#retry-btn')!.addEventListener('click', () => renderSetup(container));
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
