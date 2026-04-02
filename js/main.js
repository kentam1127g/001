/* ===== main.js — エントリーポイント・初期化 ===== */

import { INITIAL_VISIBLE_COUNT, INITIAL_EXTRA_COUNT, LAST_LATEST_ID_KEY, LAST_READ_ID_KEY } from './config.js';
import { state } from './state.js';
import { lockScroll } from './scroll.js';
import { updateClock } from './utils.js';
import { loadEntriesFromContent, loadSharedCounts } from './data.js';
import { render, showMoreEntries, showNewerEntries, returnToLatest, handleHashChange, syncLastViewedToDOM } from './render.js';
import { showEntryPreviewModal } from './modals.js';
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

    // 新着投稿チェック
    {
      const lastLatestId    = localStorage.getItem(LAST_LATEST_ID_KEY);
      const currentLatestId = state.allEntries.length ? state.allEntries[state.allEntries.length - 1].id : null;
      if (currentLatestId) {
        localStorage.setItem(LAST_LATEST_ID_KEY, currentLatestId);
      }
      if (lastLatestId && currentLatestId && lastLatestId !== currentLatestId) {
        const modal = document.getElementById('newPostsModal');
        if (modal) {
          modal.classList.add('is-open');
          lockScroll();
        }
      }
    }

    if (!state.anchoredEntryId) {
      state.visibleEntryCount = INITIAL_VISIBLE_COUNT;
    }
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

    // 既読カウントのバックグラウンド取得（全エントリIDを渡して一括取得）
    {
      const countsPromise = loadSharedCounts(state.allEntries.map(e => e.id));
      countsPromise.then(({ counts, lastViewedAt }) => {
        console.log('[counts] server data loaded:', counts);
        state.sharedCounts = counts;
        state.sharedLastViewed = lastViewedAt || {};
        state.countsLoaded = true;

        document.querySelectorAll('[data-view-count-id]').forEach(badge => {
          const id      = badge.dataset.viewCountId;
          const numberEl = badge.querySelector('.view-count-number');
          if (!numberEl) return;
          const shared  = state.sharedCounts[id];
          numberEl.textContent = String(shared !== undefined ? shared : 0);
          syncLastViewedToDOM(id, state.sharedLastViewed[id]);
        });
      }).catch(err => console.error('[counts] background load failed:', err));
    }
  } catch (error) {
    console.error('[init] failed:', error);
    const entriesEl = document.getElementById('entries');
    if (entriesEl) entriesEl.innerHTML = '<div class="empty">投稿の読み込みに失敗しました。コンソールを確認してください。</div>';
    document.body.classList.add('is-ready');
  }
}

init();
