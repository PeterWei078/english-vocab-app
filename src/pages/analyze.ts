import type { GeminiLookupResult, VocabularyItem, MasteryLevel } from '../types/index';
import { analyzeArticle, ThrottleError } from '../services/ai';
import { loadSettings, addVocabItem, wordExists } from '../services/storage';
import { speak } from '../services/speech';
import { showToast } from '../components/toast';

const MAX_CHARS = 5000;

interface ResultItem {
  result: GeminiLookupResult;
  checked: boolean;
  alreadySaved: boolean;
}

let items: ResultItem[] = [];
let selectedMastery: MasteryLevel = 'unfamiliar';

export function renderAnalyzePage(container: HTMLElement): void {
  items = [];
  selectedMastery = 'unfamiliar';

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">文章分析</h1>
        <p class="page-subtitle">貼上英文文章，AI 自動找出 B2～C1 程度單字與片語</p>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="form-group">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <label class="label" style="margin:0">貼上英文文章</label>
            <span id="char-count" style="font-size:12px;color:var(--text-muted)">0 / ${MAX_CHARS}</span>
          </div>
          <textarea
            id="article-input"
            class="input"
            style="min-height:200px;resize:vertical;line-height:1.6;font-size:14px"
            placeholder="在此貼上英文文章…"
            maxlength="${MAX_CHARS}"
          ></textarea>
        </div>
        <button id="analyze-btn" class="btn btn-primary btn-lg btn-full">
          🔍 分析文章（找出 B2～C1 單字）
        </button>
      </div>

      <div id="analyze-output"></div>
    </div>
  `;

  bindAnalyzeEvents(container);
}

function bindAnalyzeEvents(container: HTMLElement): void {
  const textarea = container.querySelector<HTMLTextAreaElement>('#article-input')!;
  const charCount = container.querySelector<HTMLElement>('#char-count')!;
  const btn = container.querySelector<HTMLButtonElement>('#analyze-btn')!;

  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    charCount.textContent = `${len} / ${MAX_CHARS}`;
    charCount.style.color = len > MAX_CHARS * 0.9 ? 'var(--danger)' : 'var(--text-muted)';
  });

  btn.addEventListener('click', () => {
    const text = textarea.value.trim();
    if (!text) {
      showToast('請先貼上英文文章', 'warning');
      return;
    }
    if (text.length < 100) {
      showToast('文章太短，建議至少 100 個字元', 'warning');
      return;
    }
    performAnalysis(text, container);
  });
}

async function performAnalysis(article: string, container: HTMLElement): Promise<void> {
  const settings = loadSettings();
  if (!settings.geminiApiKey) {
    showToast('請先在「設定」頁面輸入 Gemini API Key', 'warning');
    window.location.hash = '#settings';
    return;
  }

  const btn = container.querySelector<HTMLButtonElement>('#analyze-btn')!;
  const output = container.querySelector<HTMLElement>('#analyze-output')!;

  btn.disabled = true;
  btn.textContent = '分析中…';
  output.innerHTML = `
    <div class="loading-overlay">
      <div class="spinner"></div>
      <span>AI 正在分析文章，找出 B2～C1 單字…</span>
    </div>
  `;

  try {
    const results = await analyzeArticle(settings.geminiApiKey, article);

    if (!results.length) {
      output.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🤔</div>
          <p class="empty-state-text">找不到符合條件的單字</p>
          <p class="empty-state-hint">請嘗試貼上更長或更進階的英文文章</p>
        </div>
      `;
      return;
    }

    items = results.map((r) => ({
      result: r,
      checked: !wordExists(r.word),
      alreadySaved: wordExists(r.word),
    }));

    renderResults(output);
  } catch (err) {
    const msg =
      err instanceof ThrottleError
        ? err.message
        : err instanceof Error
        ? err.message
        : '未知錯誤';
    output.innerHTML = `
      <div class="card" style="color:var(--danger)">
        <strong>分析失敗</strong><br>
        <span style="font-size:13px">${escHtml(msg)}</span>
      </div>
    `;
    showToast(`分析失敗：${msg}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 重新分析';
  }
}

function renderResults(output: HTMLElement): void {
  const checkedCount = items.filter((i) => i.checked).length;

  output.innerHTML = `
    <div class="analyze-toolbar">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <span style="font-size:14px;font-weight:600;color:var(--text-primary)">
          找到 <span style="color:var(--accent)">${items.length}</span> 個單字
        </span>
        <button id="select-all-btn" class="btn btn-secondary btn-sm">全選</button>
        <button id="deselect-all-btn" class="btn btn-secondary btn-sm">全不選</button>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:13px;color:var(--text-secondary)">熟練度：</span>
          <div class="mastery-selector" style="gap:4px" id="global-mastery">
            <button class="mastery-option unfamiliar selected" data-level="unfamiliar" style="min-width:60px;padding:5px 8px;font-size:12px">🔴 不熟</button>
            <button class="mastery-option okay" data-level="okay" style="min-width:60px;padding:5px 8px;font-size:12px">🟡 尚可</button>
            <button class="mastery-option familiar" data-level="familiar" style="min-width:60px;padding:5px 8px;font-size:12px">🟢 熟悉</button>
          </div>
        </div>
        <button id="save-selected-btn" class="btn btn-primary" ${checkedCount === 0 ? 'disabled' : ''}>
          📥 存入選取（<span id="save-count">${checkedCount}</span>）
        </button>
      </div>
    </div>

    <div id="result-cards" class="analyze-cards"></div>
  `;

  renderCards(output);
  bindResultEvents(output);
}

function renderCards(output: HTMLElement): void {
  const grid = output.querySelector<HTMLElement>('#result-cards')!;
  grid.innerHTML = '';

  items.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = `analyze-card${item.alreadySaved ? ' already-saved' : ''}${item.checked ? ' is-checked' : ''}`;
    card.dataset.idx = String(idx);

    const relatedHtml = item.result.relatedInfo
      .map(
        (r) =>
          `<div class="vocab-related-item">
            <span class="vocab-related-label">${escHtml(r.label)}：</span>
            <span class="vocab-related-content">${escHtml(r.content)}</span>
          </div>`
      )
      .join('');

    const tagsHtml = item.result.tags
      .map((t) => `<span class="tag">${escHtml(t)}</span>`)
      .join('');

    card.innerHTML = `
      <div class="analyze-card-check">
        <label class="analyze-checkbox-wrap">
          <input
            type="checkbox"
            class="analyze-checkbox"
            ${item.checked ? 'checked' : ''}
            ${item.alreadySaved ? 'disabled' : ''}
            data-idx="${idx}"
          />
          <span class="analyze-checkbox-box"></span>
        </label>
        ${item.alreadySaved ? '<span class="already-saved-badge">✅ 已收藏</span>' : ''}
      </div>

      <div class="analyze-card-body">
        <div class="analyze-card-header">
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
            <span class="vocab-word">${escHtml(item.result.word)}</span>
            <span class="vocab-pos">${escHtml(item.result.partOfSpeech)}</span>
          </div>
          <button class="btn-icon speak-btn" data-word="${escHtml(item.result.word)}" title="朗讀">🔊</button>
        </div>

        <p class="vocab-translation" style="margin-bottom:8px">${escHtml(item.result.translation)}</p>

        <p class="vocab-example" style="margin-bottom:2px">"${escHtml(item.result.exampleSentence)}"</p>
        <p class="vocab-example-translation" style="margin-bottom:8px">${escHtml(item.result.exampleTranslation)}</p>

        ${relatedHtml ? `<div class="vocab-related" style="margin-bottom:8px">${relatedHtml}</div>` : ''}
        ${tagsHtml ? `<div class="tags">${tagsHtml}</div>` : ''}
      </div>
    `;

    grid.appendChild(card);
  });
}

function bindResultEvents(output: HTMLElement): void {
  // Select / Deselect All
  output.querySelector('#select-all-btn')!.addEventListener('click', () => {
    items.forEach((item) => { if (!item.alreadySaved) item.checked = true; });
    syncCheckboxes(output);
  });

  output.querySelector('#deselect-all-btn')!.addEventListener('click', () => {
    items.forEach((item) => { if (!item.alreadySaved) item.checked = false; });
    syncCheckboxes(output);
  });

  // Global mastery selector
  output.querySelectorAll('#global-mastery .mastery-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedMastery = (btn as HTMLElement).dataset.level as MasteryLevel;
      output.querySelectorAll('#global-mastery .mastery-option').forEach((b) =>
        b.classList.remove('selected')
      );
      btn.classList.add('selected');
    });
  });

  // Individual checkboxes
  output.addEventListener('change', (e) => {
    const checkbox = (e.target as HTMLElement).closest('.analyze-checkbox') as HTMLInputElement | null;
    if (!checkbox) return;
    const idx = Number(checkbox.dataset.idx);
    items[idx].checked = checkbox.checked;
    const card = output.querySelector(`.analyze-card[data-idx="${idx}"]`);
    card?.classList.toggle('is-checked', checkbox.checked);
    updateSaveButton(output);
  });

  // Speak buttons
  output.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.speak-btn') as HTMLElement | null;
    if (btn) speak(btn.dataset.word ?? '');
  });

  // Save button
  output.querySelector('#save-selected-btn')!.addEventListener('click', () =>
    saveSelected(output)
  );
}

function syncCheckboxes(output: HTMLElement): void {
  items.forEach((item, idx) => {
    const cb = output.querySelector<HTMLInputElement>(`.analyze-checkbox[data-idx="${idx}"]`);
    if (cb) cb.checked = item.checked;
    const card = output.querySelector(`.analyze-card[data-idx="${idx}"]`);
    card?.classList.toggle('is-checked', item.checked);
  });
  updateSaveButton(output);
}

function updateSaveButton(output: HTMLElement): void {
  const count = items.filter((i) => i.checked && !i.alreadySaved).length;
  const btn = output.querySelector<HTMLButtonElement>('#save-selected-btn')!;
  const countEl = output.querySelector<HTMLElement>('#save-count')!;
  countEl.textContent = String(count);
  btn.disabled = count === 0;
}

function saveSelected(output: HTMLElement): void {
  const toSave = items.filter((i) => i.checked && !i.alreadySaved);
  if (!toSave.length) return;

  toSave.forEach(({ result }) => {
    const item: VocabularyItem = {
      id: crypto.randomUUID(),
      word: result.word,
      translation: result.translation,
      partOfSpeech: result.partOfSpeech,
      exampleSentence: result.exampleSentence,
      exampleTranslation: result.exampleTranslation,
      relatedInfo: result.relatedInfo,
      tags: result.tags,
      isPinned: false,
      createdAt: Date.now(),
      masteryLevel: selectedMastery,
    };
    addVocabItem(item);
  });

  showToast(`已存入 ${toSave.length} 個單字 ✅`, 'success');

  // Mark as saved in items array
  toSave.forEach(({ result }) => {
    const item = items.find((i) => i.result.word === result.word);
    if (item) {
      item.alreadySaved = true;
      item.checked = false;
    }
  });

  renderCards(output);
  bindResultEvents(output);
  updateSaveButton(output);
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
