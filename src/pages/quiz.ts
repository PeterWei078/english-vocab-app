import type { QuizQuestion, VocabularyItem, QuizScope } from '../types/index';
import { generateQuiz, ThrottleError } from '../services/ai';
import { loadSettings, loadVocab } from '../services/storage';
import { showToast } from '../components/toast';

interface QuizState {
  questions: QuizQuestion[];
  currentIndex: number;
  score: number;
  wrongItems: Array<{ q: QuizQuestion; userAnswer: string }>;
  answered: boolean;
}

let state: QuizState | null = null;
let filteredWords: VocabularyItem[] = [];

export function renderQuizPage(container: HTMLElement): void {
  state = null;
  filteredWords = [];
  renderSetup(container);
}

// ── Setup Screen ────────────────────────────────────────────
function renderSetup(container: HTMLElement): void {
  const all = loadVocab();
  const unfamiliar = all.filter((v) => v.masteryLevel === 'unfamiliar');

  container.innerHTML = `
    <div class="page">
      <div class="quiz-setup">
        <div class="page-header">
          <h1 class="page-title">AI 測驗</h1>
          <p class="page-subtitle">根據你的單字庫，AI 自動出題</p>
        </div>

        ${
          all.length < 5
            ? `<div class="card" style="text-align:center;color:var(--text-secondary)">
                <div style="font-size:40px;margin-bottom:12px">📚</div>
                <p style="font-weight:600;margin-bottom:6px">單字庫至少需要 5 個單字才能生成測驗</p>
                <p style="font-size:13px">目前共 ${all.length} 個單字</p>
               </div>`
            : `<div class="card">
                <div class="form-group">
                  <label class="label">測驗範圍</label>
                  <select id="scope-select" class="select">
                    <option value="all">全部單字（${all.length} 個）</option>
                    <option value="unfamiliar" ${unfamiliar.length < 5 ? 'disabled' : ''}>
                      🔴 不熟的字（${unfamiliar.length} 個）${unfamiliar.length < 5 ? ' — 不足 5 個' : ''}
                    </option>
                  </select>
                </div>

                <div style="background:var(--bg-secondary);border-radius:var(--radius);padding:12px;margin-bottom:16px;font-size:13px;color:var(--text-secondary)">
                  <strong>題型說明：</strong><br>
                  選擇題（看英文選中文）、填空題（在句子中填單字）、翻譯題（看中文寫英文）各約三分之一。<br>
                  題數：最少 5 題、最多 30 題。
                </div>

                <button id="start-quiz-btn" class="btn btn-primary btn-full btn-lg">
                  🎯 開始生成測驗
                </button>
               </div>`
        }
      </div>
    </div>
  `;

  container.querySelector('#start-quiz-btn')?.addEventListener('click', () => {
    const scope = (container.querySelector<HTMLSelectElement>('#scope-select')?.value ?? 'all') as QuizScope;
    startQuiz(scope, container);
  });
}

async function startQuiz(scope: QuizScope, container: HTMLElement): Promise<void> {
  const settings = loadSettings();
  if (!settings.geminiApiKey) {
    showToast('請先在「設定」頁面輸入 Gemini API Key', 'warning');
    window.location.hash = '#settings';
    return;
  }

  const all = loadVocab();
  filteredWords = scope === 'unfamiliar'
    ? all.filter((v) => v.masteryLevel === 'unfamiliar')
    : all;

  if (filteredWords.length < 5) {
    showToast('單字數量不足，無法生成測驗', 'warning');
    return;
  }

  container.innerHTML = `
    <div class="page">
      <div class="quiz-setup">
        <div class="loading-overlay">
          <div class="spinner"></div>
          <span>AI 正在生成測驗題…</span>
        </div>
      </div>
    </div>
  `;

  try {
    const questions = await generateQuiz(settings.geminiApiKey, filteredWords);
    state = {
      questions,
      currentIndex: 0,
      score: 0,
      wrongItems: [],
      answered: false,
    };
    renderQuestion(container);
  } catch (err) {
    const msg =
      err instanceof ThrottleError
        ? err.message
        : err instanceof Error
        ? err.message
        : '未知錯誤';
    showToast(`測驗生成失敗：${msg}`, 'error');
    renderSetup(container);
  }
}

// ── Question Screen ─────────────────────────────────────────
function renderQuestion(container: HTMLElement): void {
  if (!state) return;

  const { questions, currentIndex } = state;
  const q = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;

  state.answered = false;

  container.innerHTML = `
    <div class="page">
      <div class="quiz-question-area">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:13px;color:var(--text-muted)">第 ${currentIndex + 1} 題 / 共 ${questions.length} 題</span>
          <span style="font-size:13px;color:var(--text-muted)">得分：${state.score}</span>
        </div>
        <div class="quiz-progress-bar">
          <div class="quiz-progress-fill" style="width:${progress}%"></div>
        </div>

        <div class="card" id="question-card">
          <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">
            ${q.type === 'multiple-choice' ? '選擇題' : q.type === 'fill-blank' ? '填空題' : '翻譯題'}
          </div>
          <p style="font-size:16px;font-weight:600;margin-bottom:20px;line-height:1.5">${escHtml(q.question)}</p>
          <div id="answer-area"></div>
          <div id="feedback-area"></div>
        </div>

        <div id="next-btn-area" style="margin-top:16px"></div>
      </div>
    </div>
  `;

  renderAnswerArea(q, container);
}

function renderAnswerArea(q: QuizQuestion, container: HTMLElement): void {
  const area = container.querySelector<HTMLElement>('#answer-area')!;

  if (q.type === 'multiple-choice' && q.options) {
    q.options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-option';
      btn.textContent = opt;
      btn.addEventListener('click', () => handleAnswer(opt, q, container));
      area.appendChild(btn);
    });
  } else {
    // fill-blank or zh-to-en
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <input id="fill-input" class="quiz-fill-input" type="text" placeholder="輸入答案…" autocomplete="off" />
      <div style="margin-top:10px">
        <button id="submit-fill-btn" class="btn btn-primary">確認</button>
      </div>
    `;
    area.appendChild(wrap);

    const input = wrap.querySelector<HTMLInputElement>('#fill-input')!;
    const submitBtn = wrap.querySelector<HTMLButtonElement>('#submit-fill-btn')!;

    const submit = () => {
      const val = input.value.trim();
      if (!val) return;
      handleAnswer(val, q, container);
      submitBtn.disabled = true;
      input.disabled = true;
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
    submitBtn.addEventListener('click', submit);

    setTimeout(() => input.focus(), 50);
  }
}

function handleAnswer(
  userAnswer: string,
  q: QuizQuestion,
  container: HTMLElement
): void {
  if (!state || state.answered) return;
  state.answered = true;

  const isCorrect =
    userAnswer.toLowerCase().trim() === q.answer.toLowerCase().trim();

  if (isCorrect) {
    state.score++;
  } else {
    state.wrongItems.push({ q, userAnswer });
  }

  // Visual feedback on options / input
  if (q.type === 'multiple-choice') {
    container.querySelectorAll<HTMLButtonElement>('.quiz-option').forEach((btn) => {
      btn.disabled = true;
      if (btn.textContent?.trim() === q.answer) {
        btn.classList.add('correct');
      } else if (btn.textContent?.trim() === userAnswer && !isCorrect) {
        btn.classList.add('wrong');
      }
    });
  } else {
    const input = container.querySelector<HTMLInputElement>('#fill-input');
    if (input) {
      input.classList.add(isCorrect ? 'correct' : 'wrong');
    }
  }

  // Feedback message
  const feedbackArea = container.querySelector<HTMLElement>('#feedback-area')!;
  feedbackArea.innerHTML = `
    <div class="quiz-feedback ${isCorrect ? 'correct' : 'wrong'}" style="margin-top:16px">
      <strong>${isCorrect ? '✅ 正確！' : `❌ 答錯了，正確答案是：${escHtml(q.answer)}`}</strong><br>
      <span style="font-size:13px">${escHtml(q.explanation)}</span>
    </div>
  `;

  // Next / Finish button
  const nextArea = container.querySelector<HTMLElement>('#next-btn-area')!;
  const isLast = state.currentIndex === state.questions.length - 1;
  nextArea.innerHTML = `
    <button id="next-btn" class="btn btn-primary btn-full">
      ${isLast ? '查看成績 🎉' : '下一題 →'}
    </button>
  `;
  nextArea.querySelector('#next-btn')!.addEventListener('click', () => {
    if (isLast) {
      renderResult(container);
    } else {
      state!.currentIndex++;
      renderQuestion(container);
    }
  });
}

// ── Result Screen ────────────────────────────────────────────
function renderResult(container: HTMLElement): void {
  if (!state) return;

  const { score, questions, wrongItems } = state;
  const total = questions.length;
  const pct = Math.round((score / total) * 100);

  let grade = '';
  if (score === total) grade = '🏆 完美！全部答對！';
  else if (pct >= 80) grade = '🌟 優秀！繼續保持！';
  else if (pct >= 60) grade = '📈 不錯！還有進步空間';
  else grade = '💪 加油！多練習幾次吧';

  const wrongHtml = wrongItems.length
    ? wrongItems
        .map(
          (w) => `
        <div style="padding:12px 0;border-bottom:1px solid var(--border)">
          <div style="font-weight:600;margin-bottom:4px">${escHtml(w.q.word)}</div>
          <div style="font-size:13px;color:var(--text-secondary)">${escHtml(w.q.question)}</div>
          <div style="font-size:13px;margin-top:4px">
            你的答案：<span style="color:var(--danger)">${escHtml(w.userAnswer)}</span>
            正確答案：<span style="color:var(--success)">${escHtml(w.q.answer)}</span>
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${escHtml(w.q.explanation)}</div>
        </div>`
        )
        .join('')
    : '';

  container.innerHTML = `
    <div class="page">
      <div class="quiz-setup">
        <div class="card" style="text-align:center;margin-bottom:20px">
          <div style="font-size:48px;margin-bottom:12px">📊</div>
          <div style="font-size:32px;font-weight:800;margin-bottom:6px">${score} / ${total}</div>
          <div style="font-size:18px;color:var(--text-secondary);margin-bottom:12px">${pct}%</div>
          <div style="font-size:15px;font-weight:600;color:var(--accent)">${grade}</div>
        </div>

        ${
          wrongItems.length
            ? `<div class="card">
                <h3 style="font-size:15px;font-weight:700;margin-bottom:12px">❌ 答錯的題目（${wrongItems.length} 題）</h3>
                ${wrongHtml}
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

  container.querySelector('#retry-btn')!.addEventListener('click', () =>
    renderSetup(container)
  );
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
