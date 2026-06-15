import type { VocabularyItem, MasteryLevel } from '../types/index';
import { updateVocabItem, deleteVocabItem } from '../services/storage';
import { speak } from '../services/speech';
import { renderTagEditor } from './tagEditor';
import { showToast } from './toast';

const MASTERY_CONFIG: Record<
  MasteryLevel,
  { label: string; icon: string }
> = {
  unfamiliar: { label: '不熟', icon: '🔴' },
  okay:       { label: '尚可', icon: '🟡' },
  familiar:   { label: '熟悉', icon: '🟢' },
};

const MASTERY_ORDER: MasteryLevel[] = ['unfamiliar', 'okay', 'familiar'];

export function renderVocabCard(
  item: VocabularyItem,
  onDelete: (id: string) => void
): HTMLElement {
  const card = document.createElement('div');
  card.className = `vocab-card${item.isPinned ? ' pinned' : ''}`;
  card.dataset.id = item.id;

  const rebuild = (current: VocabularyItem) => {
    card.className = `vocab-card${current.isPinned ? ' pinned' : ''}`;
    card.innerHTML = '';

    // ── Header ──
    const header = document.createElement('div');
    header.className = 'vocab-card-header';

    const wordBlock = document.createElement('div');
    wordBlock.className = 'vocab-card-word';
    wordBlock.innerHTML = `
      <span class="vocab-word">${current.word}</span>
      <span class="vocab-pos">${current.partOfSpeech}</span>
    `;
    header.appendChild(wordBlock);

    const actions = document.createElement('div');
    actions.className = 'vocab-card-actions';

    // Speak word
    const speakBtn = document.createElement('button');
    speakBtn.className = 'btn-icon';
    speakBtn.title = '朗讀單字';
    speakBtn.textContent = '🔊';
    speakBtn.addEventListener('click', () => speak(current.word));
    actions.appendChild(speakBtn);

    // Pin
    const pinBtn = document.createElement('button');
    pinBtn.className = 'btn-icon';
    pinBtn.title = current.isPinned ? '取消置頂' : '置頂';
    pinBtn.textContent = current.isPinned ? '📌' : '📍';
    pinBtn.addEventListener('click', () => {
      const next = { ...current, isPinned: !current.isPinned };
      updateVocabItem(current.id, { isPinned: next.isPinned });
      rebuild(next);
    });
    actions.appendChild(pinBtn);

    // Delete
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-icon';
    delBtn.title = '刪除';
    delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', () => {
      if (confirm(`確定刪除「${current.word}」？`)) {
        deleteVocabItem(current.id);
        card.remove();
        onDelete(current.id);
        showToast(`已刪除「${current.word}」`, 'info');
      }
    });
    actions.appendChild(delBtn);

    header.appendChild(actions);
    card.appendChild(header);

    // ── Translation ──
    const trans = document.createElement('div');
    trans.className = 'vocab-translation';
    trans.textContent = current.translation;
    card.appendChild(trans);

    // ── Example ──
    const exSection = document.createElement('div');
    exSection.innerHTML = `
      <div class="vocab-example">"${current.exampleSentence}"
        <button class="btn-icon" style="display:inline-flex;width:24px;height:24px;font-size:14px;vertical-align:middle" title="朗讀例句">🔊</button>
      </div>
      <div class="vocab-example-translation">${current.exampleTranslation}</div>
    `;
    exSection.querySelector('button')!.addEventListener('click', () =>
      speak(current.exampleSentence, 0.85)
    );
    card.appendChild(exSection);

    // ── Related Info ──
    if (current.relatedInfo.length) {
      const rel = document.createElement('div');
      rel.className = 'vocab-related';
      current.relatedInfo.forEach((r) => {
        const item = document.createElement('div');
        item.className = 'vocab-related-item';
        item.innerHTML = `<span class="vocab-related-label">${r.label}：</span><span class="vocab-related-content">${r.content}</span>`;
        rel.appendChild(item);
      });
      card.appendChild(rel);
    }

    // ── Footer ──
    const footer = document.createElement('div');
    footer.className = 'vocab-card-footer';

    // Mastery buttons (cycle on click)
    const masteryGroup = document.createElement('div');
    masteryGroup.style.display = 'flex';
    masteryGroup.style.gap = '4px';

    MASTERY_ORDER.forEach((level) => {
      const { icon, label } = MASTERY_CONFIG[level];
      const btn = document.createElement('button');
      btn.className = `mastery-btn ${level}${current.masteryLevel === level ? ' selected' : ''}`;
      btn.style.opacity = current.masteryLevel === level ? '1' : '0.4';
      btn.textContent = `${icon} ${label}`;
      btn.title = `標記為「${label}」`;
      btn.addEventListener('click', () => {
        updateVocabItem(current.id, { masteryLevel: level });
        rebuild({ ...current, masteryLevel: level });
      });
      masteryGroup.appendChild(btn);
    });

    footer.appendChild(masteryGroup);

    const date = document.createElement('span');
    date.className = 'vocab-date';
    date.textContent = new Date(current.createdAt).toLocaleDateString('zh-TW');
    footer.appendChild(date);

    card.appendChild(footer);

    // ── Tags ──
    const tagSection = document.createElement('div');
    tagSection.style.marginTop = '10px';
    const tagEditor = renderTagEditor(current.tags, current.id, (newTags) => {
      current = { ...current, tags: newTags };
    });
    tagSection.appendChild(tagEditor);
    card.appendChild(tagSection);
  };

  rebuild(item);
  return card;
}
