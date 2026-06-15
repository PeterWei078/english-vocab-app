import type { VocabularyItem, SortMode, MasteryLevel } from '../types/index';
import { loadVocab, saveVocab } from '../services/storage';
import { renderVocabCard } from '../components/vocabCard';
import { showToast } from '../components/toast';

let currentSort: SortMode = 'newest';
let currentSearch = '';
let activeTag: string | null = null;

export function renderVocabularyPage(container: HTMLElement): void {
  // Reset state on page load
  currentSearch = '';
  activeTag = null;

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">單字庫</h1>
      </div>

      <div id="stats-bar" class="stats-bar"></div>
      <div id="tag-filter-index" class="tag-filter-index"></div>

      <div class="vocab-toolbar">
        <div class="search-bar">
          <div class="search-input-wrap">
            <span class="search-icon">🔍</span>
            <input
              id="search-input"
              class="input"
              type="text"
              placeholder="搜尋單字、翻譯、標籤…"
              autocomplete="off"
            />
          </div>
        </div>
        <select id="sort-select" class="select" style="width:auto;flex-shrink:0">
          <option value="newest">🕐 最新加入</option>
          <option value="alpha">🔤 A–Z</option>
          <option value="random">🎲 隨機</option>
          <option value="unfamiliar">🔴 不熟</option>
          <option value="okay">🟡 尚可</option>
          <option value="familiar">🟢 熟悉</option>
        </select>
      </div>

      <div id="vocab-grid" class="vocab-grid"></div>
    </div>
  `;

  bindVocabEvents(container);
  renderAll(container);
}

function bindVocabEvents(container: HTMLElement): void {
  const searchInput = container.querySelector<HTMLInputElement>('#search-input')!;
  const sortSelect = container.querySelector<HTMLSelectElement>('#sort-select')!;

  sortSelect.value = currentSort;

  searchInput.addEventListener('input', () => {
    currentSearch = searchInput.value.trim().toLowerCase();
    renderAll(container);
  });

  sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value as SortMode;
    renderAll(container);
  });
}

function renderAll(container: HTMLElement): void {
  const all = loadVocab();
  renderStats(container, all);
  renderTagIndex(container, all);

  const filtered = applyFilter(all);
  const sorted = applySort(filtered);
  renderCards(container, sorted);
}

function renderStats(container: HTMLElement, all: VocabularyItem[]): void {
  const counts: Record<MasteryLevel, number> = {
    unfamiliar: 0,
    okay: 0,
    familiar: 0,
  };
  all.forEach((v) => counts[v.masteryLevel]++);

  const bar = container.querySelector<HTMLElement>('#stats-bar')!;
  bar.innerHTML = `
    <span class="stat-chip total">📚 ${all.length} 個單字</span>
    <span class="stat-chip unfamiliar">🔴 不熟 ${counts.unfamiliar}</span>
    <span class="stat-chip okay">🟡 尚可 ${counts.okay}</span>
    <span class="stat-chip familiar">🟢 熟悉 ${counts.familiar}</span>
  `;
}

function renderTagIndex(container: HTMLElement, all: VocabularyItem[]): void {
  const tagCounts = new Map<string, number>();
  all.forEach((v) =>
    v.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1))
  );

  const index = container.querySelector<HTMLElement>('#tag-filter-index')!;
  if (!tagCounts.size) {
    index.innerHTML = '';
    return;
  }

  const sorted = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
  index.innerHTML =
    `<span class="tag clickable${activeTag === null ? ' active' : ''}" data-tag="">全部</span>` +
    sorted
      .map(
        ([tag, count]) =>
          `<span class="tag clickable${activeTag === tag ? ' active' : ''}" data-tag="${escHtml(tag)}">${escHtml(tag)} <small>${count}</small></span>`
      )
      .join('');

  index.querySelectorAll('.tag').forEach((el) => {
    el.addEventListener('click', () => {
      const tag = (el as HTMLElement).dataset.tag ?? '';
      activeTag = tag || null;
      renderAll(container);
    });
  });
}

function applyFilter(all: VocabularyItem[]): VocabularyItem[] {
  let result = all;

  if (activeTag) {
    result = result.filter((v) => v.tags.includes(activeTag!));
  }

  if (currentSearch) {
    result = result.filter(
      (v) =>
        v.word.toLowerCase().includes(currentSearch) ||
        v.translation.includes(currentSearch) ||
        v.tags.some((t) => t.includes(currentSearch))
    );
  }

  return result;
}

function applySort(items: VocabularyItem[]): VocabularyItem[] {
  // Pinned always first
  const pinned = items.filter((v) => v.isPinned);
  const rest = items.filter((v) => !v.isPinned);

  let sorted: VocabularyItem[];

  if (currentSort === 'newest') {
    sorted = [...rest].sort((a, b) => b.createdAt - a.createdAt);
  } else if (currentSort === 'alpha') {
    sorted = [...rest].sort((a, b) => a.word.localeCompare(b.word));
  } else if (currentSort === 'random') {
    sorted = [...rest].sort(() => Math.random() - 0.5);
  } else {
    // Filter by mastery and sort newest
    sorted = [...rest]
      .filter((v) => v.masteryLevel === currentSort)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  return [...pinned.sort((a, b) => b.createdAt - a.createdAt), ...sorted];
}

function renderCards(container: HTMLElement, items: VocabularyItem[]): void {
  const grid = container.querySelector<HTMLElement>('#vocab-grid')!;
  grid.innerHTML = '';

  if (!items.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <p class="empty-state-text">${
          currentSearch || activeTag
            ? '沒有符合條件的單字'
            : '單字庫還是空的'
        }</p>
        <p class="empty-state-hint">${
          currentSearch || activeTag
            ? '試試其他關鍵字或清除篩選條件'
            : '前往「查詢」頁面搜尋並儲存單字'
        }</p>
      </div>
    `;
    return;
  }

  items.forEach((item) => {
    const card = renderVocabCard(item, () => {
      renderAll(container);
    });
    grid.appendChild(card);
  });
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
