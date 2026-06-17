import type { AppSettings, Theme } from '../types/index';
import {
  loadSettings,
  saveSettings,
  loadVocab,
  exportVocabJson,
  importVocabJson,
  clearAllData,
  getStorageUsage,
} from '../services/storage';
import { lookupWord } from '../services/ai';
import { showToast } from '../components/toast';
import { applyTheme } from '../main';

function buildBookmarklet(): string {
  const appUrl =
    window.location.origin +
    window.location.pathname.replace(/\/$/, '');
  const js = `(function(){var s=(window.getSelection()||document.getSelection()).toString().trim();if(!s){alert('請先選取單字或片語');return;}window.open('${appUrl}/?q='+encodeURIComponent(s),'_blank');})();`;
  return `javascript:${js}`;
}

export function renderSettingsPage(container: HTMLElement): void {
  const settings = loadSettings();
  const vocab = loadVocab();
  const firstDate = vocab.length
    ? new Date(
        Math.min(...vocab.map((v) => v.createdAt))
      ).toLocaleDateString('zh-TW')
    : '—';

  const bookmarkletHref = buildBookmarklet();

  container.innerHTML = `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">設定</h1>
      </div>

      <div class="settings-sections">

        <!-- Bookmarklet -->
        <div class="settings-section">
          <div class="settings-section-title">網頁選字查詢（Bookmarklet）</div>
          <p style="font-size:14px;color:var(--text-secondary);margin-bottom:16px;line-height:1.7">
            將下方按鈕拖曳到瀏覽器的書籤列。之後在任何網頁上選取英文單字或片語，點一下書籤，即可自動帶入查詢。
          </p>
          <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
            <a
              id="bookmarklet-link"
              href="${escHtml(bookmarkletHref)}"
              class="btn btn-primary"
              style="cursor:grab;user-select:none"
              draggable="true"
              onclick="event.preventDefault();alert('請用拖曳的方式將此按鈕放到書籤列，不要直接點擊。')"
            >
              📖 查詢單字
            </a>
            <div style="font-size:13px;color:var(--text-muted);line-height:1.6">
              ← 拖曳此按鈕到瀏覽器書籤列<br>
              選文字後點書籤即可查詢
            </div>
          </div>
          <div style="margin-top:14px;background:var(--bg-secondary);border-radius:var(--radius);padding:12px;font-size:13px;color:var(--text-secondary)">
            <strong>使用步驟：</strong><br>
            1. 把上方「📖 查詢單字」按鈕拖曳到書籤列<br>
            2. 在任意網頁上用滑鼠選取英文單字或片語<br>
            3. 點一下書籤列的「📖 查詢單字」<br>
            4. 單字庫 App 會在新分頁開啟並自動查詢
          </div>
        </div>

        <!-- API Settings -->
        <div class="settings-section">
          <div class="settings-section-title">API 設定</div>

          <div class="form-group">
            <label class="label" for="api-key-input">Gemini API Key</label>
            <div style="display:flex;gap:8px">
              <input
                id="api-key-input"
                class="input"
                type="password"
                placeholder="請輸入 Google Gemini API Key"
                value="${escHtml(settings.geminiApiKey)}"
                autocomplete="off"
              />
              <button id="toggle-key-btn" class="btn btn-secondary btn-sm" style="flex-shrink:0">顯示</button>
            </div>
            <p style="font-size:12px;color:var(--text-muted);margin-top:4px">
              前往 <strong>Google AI Studio</strong> 取得免費 API Key（每天 1500 次免費額度）
            </p>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button id="save-key-btn" class="btn btn-primary btn-sm">儲存 API Key</button>
            <button id="test-key-btn" class="btn btn-secondary btn-sm">測試連線</button>
          </div>
        </div>

        <!-- Appearance -->
        <div class="settings-section">
          <div class="settings-section-title">外觀</div>
          <div class="settings-row">
            <div>
              <div class="settings-row-label">主題</div>
              <div class="settings-row-desc">選擇介面的顯示主題</div>
            </div>
            <select id="theme-select" class="select" style="width:auto">
              <option value="auto" ${settings.theme === 'auto' ? 'selected' : ''}>自動（跟隨系統）</option>
              <option value="light" ${settings.theme === 'light' ? 'selected' : ''}>淺色模式</option>
              <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>深色模式</option>
            </select>
          </div>
        </div>

        <!-- Data Management -->
        <div class="settings-section">
          <div class="settings-section-title">資料管理</div>

          <div class="settings-row">
            <div>
              <div class="settings-row-label">匯出單字庫</div>
              <div class="settings-row-desc">下載 JSON 備份檔</div>
            </div>
            <button id="export-btn" class="btn btn-secondary btn-sm">📤 匯出</button>
          </div>

          <div class="settings-row">
            <div>
              <div class="settings-row-label">匯入單字庫</div>
              <div class="settings-row-desc">從 JSON 備份檔還原</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
              <select id="import-mode-select" class="select" style="width:auto;font-size:12px">
                <option value="merge">合併（避免重複）</option>
                <option value="replace">取代（全部覆蓋）</option>
              </select>
              <label class="btn btn-secondary btn-sm" style="cursor:pointer">
                📥 匯入
                <input id="import-input" type="file" accept=".json" style="display:none" />
              </label>
            </div>
          </div>

          <div class="settings-row">
            <div>
              <div class="settings-row-label">清除所有資料</div>
              <div class="settings-row-desc">刪除單字庫、測驗記錄與查詢歷史</div>
            </div>
            <button id="clear-btn" class="btn btn-danger btn-sm">🗑️ 清除</button>
          </div>
        </div>

        <!-- Storage Status -->
        ${renderStorageSection()}

        <!-- Stats -->
        <div class="settings-section">
          <div class="settings-section-title">統計資料</div>
          <div class="settings-row">
            <span class="settings-row-label">單字庫數量</span>
            <span style="font-weight:600;color:var(--accent)">${vocab.length} 個單字</span>
          </div>
          <div class="settings-row">
            <span class="settings-row-label">首次建立日期</span>
            <span style="color:var(--text-secondary)">${firstDate}</span>
          </div>
          <div class="settings-row">
            <span class="settings-row-label">App 版本</span>
            <span style="color:var(--text-muted)">v1.0.0</span>
          </div>
        </div>

      </div>
    </div>
  `;

  bindSettingsEvents(container, settings);
}

function bindSettingsEvents(
  container: HTMLElement,
  settings: AppSettings
): void {
  // ── API Key ──
  const apiInput = container.querySelector<HTMLInputElement>('#api-key-input')!;
  const toggleBtn = container.querySelector<HTMLButtonElement>('#toggle-key-btn')!;
  const saveKeyBtn = container.querySelector<HTMLButtonElement>('#save-key-btn')!;
  const testKeyBtn = container.querySelector<HTMLButtonElement>('#test-key-btn')!;

  toggleBtn.addEventListener('click', () => {
    const isHidden = apiInput.type === 'password';
    apiInput.type = isHidden ? 'text' : 'password';
    toggleBtn.textContent = isHidden ? '隱藏' : '顯示';
  });

  saveKeyBtn.addEventListener('click', () => {
    settings.geminiApiKey = apiInput.value.trim();
    saveSettings(settings);
    showToast('API Key 已儲存', 'success');
  });

  testKeyBtn.addEventListener('click', async () => {
    const key = apiInput.value.trim();
    if (!key) {
      showToast('請先輸入 API Key', 'warning');
      return;
    }
    testKeyBtn.disabled = true;
    testKeyBtn.textContent = '測試中…';
    try {
      await lookupWord(key, 'hello');
      showToast('✅ API Key 有效，連線成功！', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '連線失敗';
      showToast(`❌ 連線失敗：${msg}`, 'error');
    } finally {
      testKeyBtn.disabled = false;
      testKeyBtn.textContent = '測試連線';
    }
  });

  // ── Theme ──
  const themeSelect = container.querySelector<HTMLSelectElement>('#theme-select')!;
  themeSelect.addEventListener('change', () => {
    settings.theme = themeSelect.value as Theme;
    saveSettings(settings);
    applyTheme(settings.theme);
    showToast('主題已更新', 'success');
  });

  // ── Export ──
  container.querySelector('#export-btn')!.addEventListener('click', () => {
    const json = exportVocabJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocab_backup_${formatDate()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('單字庫已匯出', 'success');
  });

  // ── Import ──
  const importInput = container.querySelector<HTMLInputElement>('#import-input')!;
  const importModeSelect = container.querySelector<HTMLSelectElement>('#import-mode-select')!;

  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    if (!file) return;
    const mode = importModeSelect.value as 'merge' | 'replace';

    if (mode === 'replace') {
      showConfirmDialog(
        '取代匯入確認',
        '這將刪除目前所有單字並以匯入的檔案取代，確定嗎？',
        () => doImport(file, mode)
      );
    } else {
      doImport(file, mode);
    }
    importInput.value = '';
  });

  // ── Clear ──
  container.querySelector('#clear-btn')!.addEventListener('click', () => {
    showConfirmDialog(
      '清除所有資料',
      '這將永久刪除所有單字、測驗記錄和查詢歷史，無法復原，確定嗎？',
      () => {
        clearAllData();
        showToast('所有資料已清除', 'info');
        renderSettingsPage(container);
      }
    );
  });
}

function doImport(file: File, mode: 'merge' | 'replace'): void {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const count = importVocabJson(reader.result as string, mode);
      showToast(
        mode === 'replace'
          ? `匯入成功！共 ${count} 個單字`
          : `成功新增 ${count} 個單字（已略過重複）`,
        'success'
      );
    } catch {
      showToast('匯入失敗，請確認檔案格式正確', 'error');
    }
  };
  reader.readAsText(file);
}

function showConfirmDialog(
  title: string,
  message: string,
  onConfirm: () => void
): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-backdrop';
  backdrop.innerHTML = `
    <div class="dialog">
      <div class="dialog-title">${escHtml(title)}</div>
      <p class="dialog-message">${escHtml(message)}</p>
      <div class="dialog-actions">
        <button id="dialog-cancel" class="btn btn-secondary">取消</button>
        <button id="dialog-confirm" class="btn btn-danger">確定</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  backdrop.querySelector('#dialog-cancel')!.addEventListener('click', () =>
    backdrop.remove()
  );
  backdrop.querySelector('#dialog-confirm')!.addEventListener('click', () => {
    backdrop.remove();
    onConfirm();
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function renderStorageSection(): string {
  const { totalBytes, usedBytes, breakdown } = getStorageUsage();
  const pct = (usedBytes / totalBytes) * 100;

  const barColor =
    pct < 50 ? 'var(--success)' :
    pct < 80 ? 'var(--warning)' :
               'var(--danger)';

  const statusLabel =
    pct < 50 ? '✅ 空間充裕' :
    pct < 80 ? '⚠️ 使用偏高' :
               '🔴 空間不足';

  // Estimate remaining words: average 900 bytes per VocabularyItem
  const AVG_ITEM_BYTES = 900;
  const remainingBytes = totalBytes - usedBytes;
  const estRemainingWords = Math.floor(remainingBytes / AVG_ITEM_BYTES);

  const breakdownRows = breakdown
    .filter((b) => b.bytes > 0)
    .map(
      (b) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
        <span style="font-size:13px;color:var(--text-secondary)">${b.label}</span>
        <span style="font-size:13px;color:var(--text-muted);font-variant-numeric:tabular-nums">${formatBytes(b.bytes)}</span>
      </div>`
    )
    .join('');

  return `
    <div class="settings-section">
      <div class="settings-section-title">儲存空間狀態</div>

      <!-- Usage bar -->
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
          <span style="font-size:15px;font-weight:600;color:var(--text-primary)">
            ${formatBytes(usedBytes)}
            <span style="font-size:13px;font-weight:400;color:var(--text-muted)"> / ${formatBytes(totalBytes)}</span>
          </span>
          <span style="font-size:13px;font-weight:500;color:${barColor}">${statusLabel}</span>
        </div>
        <div style="height:10px;background:var(--border);border-radius:var(--radius-full);overflow:hidden">
          <div style="height:100%;width:${pct.toFixed(2)}%;background:${barColor};border-radius:var(--radius-full);transition:width 0.4s ease"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:5px">
          <span style="font-size:12px;color:var(--text-muted)">${pct.toFixed(1)}% 已使用</span>
          <span style="font-size:12px;color:var(--text-muted)">預估尚可存約 ${estRemainingWords.toLocaleString()} 個單字</span>
        </div>
      </div>

      <!-- Breakdown -->
      ${breakdownRows ? `
      <div style="border-top:1px solid var(--border);padding-top:12px">
        <div style="font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">細項明細</div>
        ${breakdownRows}
      </div>` : ''}

      <!-- Info note -->
      <div style="margin-top:12px;padding:10px 12px;background:var(--bg-secondary);border-radius:var(--radius);font-size:12px;color:var(--text-muted);line-height:1.6">
        瀏覽器 LocalStorage 上限為 <strong>5 MB</strong>（各瀏覽器標準值），
        資料僅存在此裝置。建議定期使用「匯出單字庫」功能備份。
      </div>
    </div>
  `;
}

function formatDate(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
