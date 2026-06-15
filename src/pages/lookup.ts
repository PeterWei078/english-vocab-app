import type { GeminiLookupResult, VocabularyItem, MasteryLevel } from '../types/index';
import { lookupWord, ThrottleError, getThrottleRemaining } from '../services/ai';
import {
  loadSettings,
  addVocabItem,
  wordExists,
  loadHistory,
  pushHistory,
  clearHistory,
} from '../services/storage';
import { speak } from '../services/speech';
import { showToast } from '../components/toast';

let throttleTimer: ReturnType<typeof setInterval> | null = null;
let currentResult: GeminiLookupResult | null = null;
let selectedMastery: MasteryLevel = 'unfamiliar';

export function renderLookupPage(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page">
      <div class="lookup-layout">
        <!-- Main lookup area -->
        <div class="lookup-main">
          <div class="page-header">
            <h1 class="page-title">單字查詢</h1>
            <p class="page-subtitle">輸入英文單字或片語，AI 即時查詢詳細解釋</p>
          </div>

          <div class="form-group" style="margin-bottom:12px">
            <div class="input-group">
              <input
                id="lookup-input"
                class="input input-lg"
                type="text"
                placeholder="輸入單字或片語，按 Enter 查詢…"
                autocomplete="off"
                autocapitalize="none"
                spellcheck="false"
              />
              <div class="input-group-append">
                <button id="lookup-btn" class="btn btn-primary">查詢</button>
              </div>
            </div>
          </div>

          <div id="throttle-banner" style="display:none" class="throttle-banner">
            ⏳ 請等待 <span id="throttle-count">0</span> 秒後再查詢
          </div>

          <div id="lookup-output"></div>
        </div>

        <!-- History panel -->
        <aside id="history-panel">
          ${renderHistoryPanel()}
        </aside>
      </div>
    </div>
  `;

  bindLookupEvents(container);
}

function renderHistoryPanel(): string {
  const history = loadHistory();
  const items = history.length
    ? history
        .map(
          (h) => `
      <div class="lookup-history-item" data-word="${escHtml(h.word)}">
        <span class="lookup-history-word">${escHtml(h.word)}</span>
        <span class="lookup-history-translation">${escHtml(h.translation)}</span>
      </div>`
        )
        .join('')
    : `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">暫無查詢記錄</div>`;

  return `
    <div class="lookup-history-panel">
      <div class="lookup-history-header">
        <span>最近查詢</span>
        ${history.length ? `<button id="clear-history-btn" class="btn-ghost btn btn-sm" style="font-size:12px">清除</button>` : ''}
      </div>
      <div class="lookup-history-list">${items}</div>
    </div>
  `;
}

function refreshHistoryPanel(container: HTMLElement): void {
  const panel = container.querySelector('#history-panel');
  if (panel) {
    panel.innerHTML = renderHistoryPanel();
    bindHistoryEvents(container);
  }
}

function bindLookupEvents(container: HTMLElement): void {
  const input = container.querySelector<HTMLInputElement>('#lookup-input')!;
  const btn = container.querySelector<HTMLButtonElement>('#lookup-btn')!;

  const doLookup = () => {
    const word = input.value.trim();
    if (!word) return;
    performLookup(word, container);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doLookup();
  });
  btn.addEventListener('click', doLookup);

  bindHistoryEvents(container);
}

function bindHistoryEvents(container: HTMLElement): void {
  container.querySelectorAll('.lookup-history-item').forEach((el) => {
    el.addEventListener('click', () => {
      const word = (el as HTMLElement).dataset.word ?? '';
      const input = container.querySelector<HTMLInputElement>('#lookup-input');
      if (input) input.value = word;
      performLookup(word, container);
    });
  });

  container.querySelector('#clear-history-btn')?.addEventListener('click', () => {
    clearHistory();
    refreshHistoryPanel(container);
    showToast('已清除查詢記錄', 'info');
  });
}

async function performLookup(word: string, container: HTMLElement): Promise<void> {
  const settings = loadSettings();
  if (!settings.geminiApiKey) {
    showToast('請先在「設定」頁面輸入 Gemini API Key', 'warning');
    window.location.hash = '#settings';
    return;
  }

  const output = container.querySelector<HTMLElement>('#lookup-output')!;
  const btn = container.querySelector<HTMLButtonElement>('#lookup-btn')!;
  const banner = container.querySelector<HTMLElement>('#throttle-banner')!;

  // Check throttle first
  const rem = getThrottleRemaining();
  if (rem > 0) {
    showThrottle(rem, banner);
    return;
  }

  // Loading state
  btn.disabled = true;
  output.innerHTML = `
    <div class="loading-overlay">
      <div class="spinner"></div>
      <span>AI 查詢中…</span>
    </div>
  `;

  try {
    const result = await lookupWord(settings.geminiApiKey, word);
    currentResult = result;
    selectedMastery = 'unfamiliar';

    pushHistory({ word: result.word, translation: result.translation, timestamp: Date.now() });
    refreshHistoryPanel(container);

    renderResult(result, output, container);
  } catch (err) {
    if (err instanceof ThrottleError) {
      showThrottle(err.remainingMs, banner);
      output.innerHTML = '';
    } else {
      const msg = err instanceof Error ? err.message : '未知錯誤';
      output.innerHTML = `
        <div class="card" style="color:var(--danger)">
          <strong>查詢失敗</strong><br>
          <span style="font-size:13px">${escHtml(msg)}</span>
        </div>
      `;
      showToast(`查詢失敗：${msg}`, 'error');
    }
  } finally {
    btn.disabled = false;
  }
}

function renderResult(
  r: GeminiLookupResult,
  output: HTMLElement,
  container: HTMLElement
): void {
  const alreadySaved = wordExists(r.word);

  const relatedHtml = r.relatedInfo
    .map(
      (ri) =>
        `<div class="vocab-related-item">
          <span class="vocab-related-label">${escHtml(ri.label)}：</span>
          <span class="vocab-related-content">${escHtml(ri.content)}</span>
        </div>`
    )
    .join('');

  const tagsHtml = r.tags
    .map((t) => `<span class="tag">${escHtml(t)}</span>`)
    .join('');

  output.innerHTML = `
    <div class="card lookup-result">
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:4px">
        <h2 class="lookup-result-word">${escHtml(r.word)}</h2>
        <button id="speak-word-btn" class="btn-icon" title="朗讀單字" style="margin-top:4px;font-size:22px">🔊</button>
      </div>
      <span class="lookup-result-pos">${escHtml(r.partOfSpeech)}</span>

      <div style="margin-top:12px">
        <p class="lookup-result-translation">${escHtml(r.translation)}</p>
      </div>

      <div class="lookup-result-section">
        <div class="lookup-result-label">例句</div>
        <div style="display:flex;align-items:flex-start;gap:8px">
          <div>
            <p class="lookup-result-example">"${escHtml(r.exampleSentence)}"</p>
            <p class="lookup-result-example-tr">${escHtml(r.exampleTranslation)}</p>
          </div>
          <button id="speak-example-btn" class="btn-icon" title="朗讀例句" style="flex-shrink:0">🔊</button>
        </div>
      </div>

      ${
        r.relatedInfo.length
          ? `<div class="lookup-result-section">
               <div class="lookup-result-label">相關用法</div>
               <div class="vocab-related">${relatedHtml}</div>
             </div>`
          : ''
      }

      ${
        r.tags.length
          ? `<div class="tags" style="margin-bottom:16px">${tagsHtml}</div>`
          : ''
      }

      <div class="divider"></div>

      ${
        alreadySaved
          ? `<p style="color:var(--success);font-size:14px;font-weight:500">✅ 此單字已在單字庫中</p>`
          : `<div>
               <p class="label" style="margin-bottom:8px">存入單字庫（選擇熟練度）</p>
               <div class="mastery-selector" id="mastery-selector">
                 <button class="mastery-option unfamiliar selected" data-level="unfamiliar">🔴 不熟</button>
                 <button class="mastery-option okay" data-level="okay">🟡 尚可</button>
                 <button class="mastery-option familiar" data-level="familiar">🟢 熟悉</button>
               </div>
               <div class="lookup-actions" style="margin-top:12px">
                 <button id="save-btn" class="btn btn-primary">📥 存入單字庫</button>
               </div>
             </div>`
      }
    </div>
  `;

  // Events
  output.querySelector('#speak-word-btn')?.addEventListener('click', () =>
    speak(r.word)
  );
  output.querySelector('#speak-example-btn')?.addEventListener('click', () =>
    speak(r.exampleSentence, 0.85)
  );

  output.querySelectorAll('.mastery-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedMastery = (btn as HTMLElement).dataset.level as MasteryLevel;
      output.querySelectorAll('.mastery-option').forEach((b) =>
        b.classList.remove('selected')
      );
      btn.classList.add('selected');
    });
  });

  output.querySelector('#save-btn')?.addEventListener('click', () =>
    saveCurrentResult(r, output, container)
  );
}

function saveCurrentResult(
  r: GeminiLookupResult,
  output: HTMLElement,
  container: HTMLElement
): void {
  if (!currentResult) return;

  const item: VocabularyItem = {
    id: crypto.randomUUID(),
    word: r.word,
    translation: r.translation,
    partOfSpeech: r.partOfSpeech,
    exampleSentence: r.exampleSentence,
    exampleTranslation: r.exampleTranslation,
    relatedInfo: r.relatedInfo,
    tags: r.tags,
    isPinned: false,
    createdAt: Date.now(),
    masteryLevel: selectedMastery,
  };

  addVocabItem(item);
  showToast(`「${r.word}」已存入單字庫 ✅`, 'success');

  // Replace save button with saved indicator
  const saveArea = output.querySelector<HTMLElement>('[id="save-btn"]')?.parentElement?.parentElement;
  if (saveArea) {
    saveArea.innerHTML = `<p style="color:var(--success);font-size:14px;font-weight:500">✅ 已存入單字庫</p>`;
  }

  refreshHistoryPanel(container);
}

function showThrottle(remainingMs: number, banner: HTMLElement): void {
  if (throttleTimer) clearInterval(throttleTimer);

  let seconds = Math.ceil(remainingMs / 1000);
  const countEl = banner.querySelector<HTMLElement>('#throttle-count');
  if (countEl) countEl.textContent = String(seconds);
  banner.style.display = 'flex';

  throttleTimer = setInterval(() => {
    seconds--;
    if (countEl) countEl.textContent = String(seconds);
    if (seconds <= 0) {
      clearInterval(throttleTimer!);
      throttleTimer = null;
      banner.style.display = 'none';
    }
  }, 1000);
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
