import { loadSettings, saveSettings } from './services/storage';
import { renderLookupPage } from './pages/lookup';
import { renderAnalyzePage } from './pages/analyze';
import { renderVocabularyPage } from './pages/vocabulary';
import { renderQuizPage } from './pages/quiz';
import { renderSettingsPage } from './pages/settings';
import type { Theme } from './types/index';

// ── Theme ─────────────────────────────────────────────────
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = prefersDark ? 'dark' : 'light';
  } else {
    root.dataset.theme = theme;
  }
  updateThemeToggleIcon();
}

function updateThemeToggleIcon(): void {
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.textContent =
      document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙';
  }
}

function initTheme(): void {
  const settings = loadSettings();
  applyTheme(settings.theme);

  // Listen for system theme changes when set to 'auto'
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const s = loadSettings();
    if (s.theme === 'auto') applyTheme('auto');
  });
}

// ── Router ────────────────────────────────────────────────
type PageId = 'lookup' | 'analyze' | 'vocabulary' | 'quiz' | 'settings';

const RENDERERS: Record<PageId, (c: HTMLElement) => void> = {
  lookup:     (c) => renderLookupPage(c),
  analyze:    renderAnalyzePage,
  vocabulary: renderVocabularyPage,
  quiz:       renderQuizPage,
  settings:   renderSettingsPage,
};

function getPageId(hash: string): PageId {
  const id = hash.replace('#', '') as PageId;
  return id in RENDERERS ? id : 'lookup';
}

function navigate(hash: string, initialWord?: string): void {
  const pageId = getPageId(hash);
  const container = document.getElementById('page-container')!;

  if (pageId === 'lookup' && initialWord) {
    renderLookupPage(container, initialWord);
  } else {
    RENDERERS[pageId](container);
  }
  updateNavTabs(pageId);

  window.scrollTo({ top: 0, behavior: 'instant' });
}

function updateNavTabs(active: PageId): void {
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    const page = (tab as HTMLElement).dataset.page;
    tab.classList.toggle('active', page === active);
  });
}

// ── Theme Toggle Button ───────────────────────────────────
function initThemeToggle(): void {
  const btn = document.getElementById('theme-toggle');
  btn?.addEventListener('click', () => {
    const settings = loadSettings();
    const current = document.documentElement.dataset.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    settings.theme = next;
    saveSettings(settings);
    applyTheme(next);
  });
}

// ── Init ──────────────────────────────────────────────────
function init(): void {
  initTheme();
  initThemeToggle();

  // Handle ?q= from bookmarklet
  const params = new URLSearchParams(location.search);
  const bookmarkletWord = params.get('q')?.trim();
  if (bookmarkletWord) {
    history.replaceState({}, '', location.pathname + (location.hash || '#lookup'));
  }

  window.addEventListener('hashchange', () => navigate(location.hash));
  navigate(location.hash || '#lookup', bookmarkletWord);
}

init();
