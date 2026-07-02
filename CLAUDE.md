# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite, hot reload)
npm run build     # TypeScript check + Vite production build → dist/
npm run preview   # Serve the dist/ build locally
```

No test runner is configured.

## Architecture

**Stack:** Vanilla TypeScript + Vite. No UI framework (no React/Vue). All rendering is imperative DOM manipulation.

**Routing:** Hash-based SPA router in [src/main.ts](src/main.ts). `RENDERERS` maps `PageId` strings (`lookup`, `analyze`, `vocabulary`, `quiz`, `settings`) to render functions. Every page transition calls the corresponding `render*Page(container: HTMLElement)` function which replaces `#page-container`'s `innerHTML`.

**Persistence:** Everything lives in `localStorage` — no backend. [src/services/storage.ts](src/services/storage.ts) owns all read/write via typed key constants (`vocab_list`, `quiz_data`, `settings`, `lookup_history`).

**AI:** [src/services/ai.ts](src/services/ai.ts) calls the Gemini 2.5 Flash API directly from the browser. The API key is stored in localStorage settings. There is a 3-second client-side throttle (`THROTTLE_MS`) between calls. All three AI features (word lookup, quiz generation, article analysis) share a single `callGemini()` helper that expects `responseMimeType: 'application/json'`.

**Pages** (`src/pages/`): Each file exports one `render*Page(container)` function. Pages are stateless on re-render — module-level variables hold transient UI state (e.g. `currentResult`, `currentSort`) that reset when the page is re-mounted.

**Components** (`src/components/`): Reusable pieces — `vocabCard.ts` builds a full card DOM element with inline event bindings and a local `rebuild()` pattern for in-place updates without re-querying storage; `tagEditor.ts` handles tag add/remove; `toast.ts` appends to `#toast-container`.

**Types:** All shared types in [src/types/index.ts](src/types/index.ts). Core types: `VocabularyItem`, `GeminiLookupResult`, `AppSettings`, `QuizQuestion`.

**Theming:** CSS custom properties defined in [src/styles/variables.css](src/styles/variables.css). Dark mode switches by toggling `data-theme="dark"` on `<html>`. Theme is read from `AppSettings.theme` (`'light' | 'dark' | 'auto'`).

**Bookmarklet:** The app accepts `?q=<word>` in the URL to pre-fill and auto-trigger a lookup. Handled in `init()` in `main.ts` before the router runs.

## Key conventions

- Pages render by setting `container.innerHTML` with a template string, then calling a `bind*Events(container)` function. Always query elements relative to `container`, not `document`, to avoid stale selectors.
- HTML injected via template strings must escape user data through `escHtml()` (defined locally in each page file that needs it).
- `vocabCard.ts` uses a closure-local `rebuild(current)` function to re-render a card in place after mutations (pin toggle, mastery change, tag edit) without touching storage again.
- CSS class names follow a BEM-like flat pattern (`vocab-card`, `vocab-card-header`, `vocab-card-footer`) rather than nested selectors.
