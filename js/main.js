/* ===== main.js — エントリーポイント・初期化 ===== */

import { INITIAL_VISIBLE_COUNT, INITIAL_EXTRA_COUNT, LAST_LATEST_ID_KEY, LAST_READ_ID_KEY } from './config.js';
import { state } from './state.js';
import { lockScroll } from './scroll.js';
import { updateClock } from './utils.js';
import { loadEntriesFromContent } from './data.js';
import { render, showMoreEntries, showNewerEntries, returnToLatest, handleHashChange } from './render.js';
import { showEntryPreviewModal, openWelcomeAboutModal, isWelcomeModalOpen } from './modals.js';
import { initCms } from './cms.js';
import './ticker.js';

// ---- ナビゲーションボタン ----

document.getElementById('loadOlder')?.addEventListener('click', showMoreEntries);
document.getElementById('loadNewer')?.addEventListener('click', showNewerEntries);
document.getElementById('returnLatest')?.addEventListener('click', returnToLatest);
window.addEventListener('hashchange', handleHashChange);

// ---- 初期化 ----

async function init() {
  try {
    initCms();
    updateClock();
    setInterval(updateClock, 1000);

    const initialHashId = (window.location.hash && window.location.hash.startsWith('#entry-'))
      ? window.location.hash.replace('#entry-', '')
      : null;

    if (initialHashId) {
      state.anchoredEntryId = initialHashId;
      state.visibleEntryCount = 4; // ターゲット 1 + 古い方 3
      state.newerEntryCount   = 3; // 新しい方 3
    }

    state.allEntries = await loadEntriesFromContent();

// アンカー時の表示バランスを調整（合計7件）
    if (state.anchoredEntryId) {
      const anchorIndex = state.allEntries.findIndex(e => e.id === state.anchoredEntryId);
      if (anchorIndex !== -1) {
        // ターゲットより新しい投稿の実際の件数
        const actualNewerCount = state.allEntries.length - 1 - anchorIndex;
        
        // 新しい方は最大 3件。足りない分は古い方に回す
        state.newerEntryCount   = Math.min(actualNewerCount, 3);
        // 合計7件にするための visibleEntryCount (ターゲット1 + 古い方)
        // visibleEntryCount = 7 - newerEntryCount
        state.visibleEntryCount = 7 - state.newerEntryCount;
      }
    }

    let hasNewPostsNotice = false;
    let pendingAfterWelcome = null;

    // 新着投稿チェック
    {
      const lastLatestId    = localStorage.getItem(LAST_LATEST_ID_KEY);
      const currentLatestId = state.allEntries.length ? state.allEntries[state.allEntries.length - 1].id : null;
      if (currentLatestId) {
        localStorage.setItem(LAST_LATEST_ID_KEY, currentLatestId);
      }
      if (lastLatestId && currentLatestId && lastLatestId !== currentLatestId) {
        hasNewPostsNotice = true;
      }
    }

    if (!state.anchoredEntryId) {
      state.visibleEntryCount = INITIAL_VISIBLE_COUNT;
    }
    state.deferInitialVisibleCountLoad = !state.anchoredEntryId && state.allEntries.length > INITIAL_VISIBLE_COUNT;
    render();

    // 直リンクの場合はプレビューモーダルを表示
    if (initialHashId) {
      const targetEntry = state.allEntries.find(e => e.id === initialHashId);
      if (targetEntry) showEntryPreviewModal(targetEntry, { skipLoader: true });
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!state.anchoredEntryId) {
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
        }

        document.body.classList.add('is-ready');

        if (!localStorage.getItem('enpitu-visited')) {
          openWelcomeAboutModal(() => {
            if (pendingAfterWelcome) { pendingAfterWelcome(); pendingAfterWelcome = null; }
          });
        }

        if (!state.anchoredEntryId && state.allEntries.length > INITIAL_VISIBLE_COUNT) {
          setTimeout(() => {
            const beforeHeight  = document.documentElement.scrollHeight;
            const beforeScrollY = window.scrollY;

            state.visibleEntryCount = Math.min(INITIAL_VISIBLE_COUNT + INITIAL_EXTRA_COUNT, state.allEntries.length);
            state.initialScrollDone = false;
            render();

            requestAnimationFrame(() => {
              const afterHeight = document.documentElement.scrollHeight;
              window.scrollTo({
                top: beforeScrollY + (afterHeight - beforeHeight),
                behavior: 'auto'
              });
            });
          }, 80);
        }
      });
    });

    const priorityModal = hasNewPostsNotice ? document.getElementById('newPostsModal') : null;
    if (priorityModal) {
      const openPriorityModal = () => {
        priorityModal.classList.add('is-open');
        lockScroll();
      };
      if (isWelcomeModalOpen()) {
        pendingAfterWelcome = openPriorityModal;
      } else {
        openPriorityModal();
      }
    }
  } catch (error) {
    console.error('[init] failed:', error);
    const entriesEl = document.getElementById('entries');
    if (entriesEl) entriesEl.innerHTML = '<div class="empty">投稿の読み込みに失敗しました。コンソールを確認してください。</div>';
    document.body.classList.add('is-ready');
  }
}

init();

// 通信量表示
(function () {
  const el    = document.getElementById('transferKB');
  const modal = document.getElementById('transferModal');
  if (!el || !window.PerformanceObserver) return;

  // 目安の定数
  const BYTES_PER_PHOTO = 4 * 1024 * 1024; // スマホ写真 ≈ 4MB
  const BYTES_PER_MIN   = 1 * 1024 * 1024; // 動画 ≈ 1MB/分

  let totalBytes = 0;

  function updateKB() {
    totalBytes = performance.getEntriesByType('resource')
      .reduce((sum, r) => sum + (r.encodedBodySize || 0), 0);
    el.textContent = `${(totalBytes / 1024).toFixed(1)} KB`;
  }

  function updateModal() {
    const photos = (totalBytes / BYTES_PER_PHOTO).toFixed(2);
    const video  = (totalBytes / BYTES_PER_MIN).toFixed(2);
    document.getElementById('transferPhotos').textContent = `約${photos}`;
    document.getElementById('transferVideo').textContent  = `約${video}`;
  }

  // トグル
  el.addEventListener('click', () => {
    const isOpen = !modal.hidden;
    if (!isOpen) updateModal();
    modal.hidden = isOpen;
  });

  // 外クリックで閉じる
  document.addEventListener('click', (e) => {
    if (!modal.hidden && !modal.contains(e.target) && e.target !== el) {
      modal.hidden = true;
    }
  });

  const observer = new PerformanceObserver(() => updateKB());
  observer.observe({ type: 'resource', buffered: true });
})();
