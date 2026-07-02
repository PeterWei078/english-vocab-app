import type { VocabularyItem, MasteryLevel } from '../types/index';
import { loadVocab, updateVocabItem } from '../services/storage';
import { speak } from '../services/speech';

type QuizScope = 'all' | 'unfamiliar' | 'okay';

const MASTERY_CONFIG: Record<MasteryLevel, { label: string; icon: string }> = {
  unfamiliar: { label: '不熟', icon: '🔴' },
  okay:       { label: '尚可', icon: '🟡' },
  familiar:   { label: '熟悉', icon: '🟢' },
};

const MASTERY_ORDER: MasteryLevel[] = ['familiar', 'okay', 'unfamiliar'];

interface QuizState {
  words: VocabularyItem[];
  currentIndex: number;
  revealed: boolean;
  results: Array<{ word: VocabularyItem; level: MasteryLevel }>;
}

let state: QuizState | null = null;

export function renderQuizPage(container: HTMLElement): void {
  state = null;
  renderSetup(container);
}

// ── Setup Screen ────────────────────────────────────────────
function renderSetup(container: HTMLElement): void {
  const all = loadVocab();
  const unfamiliar = all.filter((v) => v.masteryLevel === 'unfamiliar');
  const okay = all.filter((v) => v.masteryLevel === 'okay');

  container.innerHTML = `
    <div class="page">
      <div class="quiz-setup">
        <div class="page-header">
          <h1 class="page-title">閃卡測驗</h1>
          <p class="page-subtitle">看單字回想意思，翻開答案自我評分</p>
        </div>

        ${
          all.length === 0
            ? `<div class="card" style="text-align:center;color:var(--text-secondary)">
                <div style="font-size:40px;margin-bottom:12px">📚</div>
                <p style="font-weight:600">單字庫還是空的，先去查詢並收藏單字吧</p>
               </div>`
            : `<div class="card">
                <div class="form-group">
                  <label class="label">測驗範圍</label>
                  <select id="scope-select" class="select">
                    <option value="all">全部單字（${all.length} 個）</option>
                    <option value="unfamiliar" ${unfamiliar.length === 0 ? 'disabled' : ''}>
                      🔴 不熟的字（${unfamiliar.length} 個）
                    </option>
                    <option value="okay" ${okay.length === 0 ? 'disabled' : ''}>
                      🟡 尚可的字（${okay.length} 個）
                    </option>
                  </select>
                </div>

                <div class="form-group" style="display:flex;align-items:center;gap:8px;margin-bottom:16px">
                  <input type="checkbox" id="shuffle-check" checked style="width:16px;height:16px" />
                  <label for="shuffle-check" style="font-size:13px;color:var(--text-secondary)">隨機排序</label>
                </div>

                <button id="start-quiz-btn" class="btn btn-primary btn-full btn-lg">
                  🎯 開始測驗
                </button>
               </div>`
        }
      </div>
    </div>
  `;

  container.querySelector('#start-quiz-btn')?.addEventListener('click', () => {
    const scope = (container.querySelector<HTMLSelectElement>('#scope-select')?.value ?? 'all') as QuizScope;
    const shuffle = container.querySelector<HTMLInputElement>('#shuffle-check')?.checked ?? true;
    startQuiz(scope, shuffle, container);
  });
}

function startQuiz(scope: QuizScope, shuffle: boolean, container: HTMLElement): void {
  const all = loadVocab();
  let words =
    scope === 'unfamiliar'
      ? all.filter((v) => v.masteryLevel === 'unfamiliar')
      : scope === 'okay'
      ? all.filter((v) => v.masteryLevel === 'okay')
      : all;

  if (words.length === 0) {
    renderSetup(container);
    return;
  }

  if (shuffle) {
    words = [...words];
    for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [words[i], words[j]] = [words[j], words[i]];
    }
  }

  state = { words, currentIndex: 0, revealed: false, results: [] };
  renderCard(container);
}

// ── Flashcard Screen ─────────────────────────────────────────
function renderCard(container: HTMLElement): void {
  if (!state) return;

  const { words, currentIndex } = state;
  const item = words[currentIndex];
  const progress = ((currentIndex + 1) / words.length) * 100;
  state.revealed = false;

  container.innerHTML = `
    <div class="page">
      <div class="quiz-question-area">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:13px;color:var(--text-muted)">第 ${currentIndex + 1} 張 / 共 ${words.length} 張</span>
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

  const item = state.words[state.currentIndex];
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

  const item = state.words[state.currentIndex];
  updateVocabItem(item.id, { masteryLevel: level });
  state.results.push({ word: item, level });

  if (state.currentIndex === state.words.length - 1) {
    renderResult(container);
  } else {
    state.currentIndex++;
    renderCard(container);
  }
}

// ── Result Screen ────────────────────────────────────────────
function renderResult(container: HTMLElement): void {
  if (!state) return;

  const { results } = state;
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
          <div style="font-weight:600">${escHtml(r.word.word)}</div>
          <div style="font-size:13px;color:var(--text-secondary)">${escHtml(r.word.translation)}</div>
        </div>`
        )
        .join('')
    : '';

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
                <h3 style="font-size:15px;font-weight:700;margin-bottom:8px">🔴 標記為不熟的單字（${unfamiliarItems.length} 個）</h3>
                ${reviewHtml}
               </div>`
            : ''
        }

        <div style="display:flex;gap:10px;margin-top:20px">
          <button id="retry-btn" class="btn btn-primary btn-full">再測一次</button>
          <button id="vocab-btn" class="btn btn-secondary btn-full" onclick="location.hash='#vocabulary'">回單字庫</button>
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
