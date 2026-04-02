/* ===== render.js — レンダリング・ナビゲーション・オブザーバー ===== */

import { INITIAL_VISIBLE_COUNT, INITIAL_EXTRA_COUNT, LOAD_MORE_COUNT, VIEW_COUNT_DELAY_MS, LAST_READ_ID_KEY } from './config.js';
import { state } from './state.js';
import { disableScroll, enableScroll, lockScroll, unlockScroll } from './scroll.js';
import { escapeHtml, normalizeImagePath, formatOnlyTime, enumerateDayLabels } from './utils.js';
import { loadSeenEntries, saveSeenEntries, bumpSharedCounts } from './data.js';

const entriesEl        = document.getElementById('entries');
const loadOlderWrap    = document.getElementById('loadOlderWrap');
const returnLatestWrap = document.getElementById('returnLatestWrap');
const loadNewerWrap    = document.getElementById('loadNewerWrap');

// ---- 表示エントリ抽出 ----

export function getVisibleEntries(entries) {
  if (state.anchoredEntryId) {
    const anchorIndex = entries.findIndex(entry => entry.id === state.anchoredEntryId);
    if (anchorIndex !== -1) {
      const end   = Math.min(anchorIndex + 1 + state.newerEntryCount, entries.length);
      const start = Math.max(anchorIndex + 1 - state.visibleEntryCount, 0);
      return entries.slice(start, end);
    }
  }
  return entries.slice(-state.visibleEntryCount);
}

// ---- ボタン状態更新 ----

export function updateLoadOlderButton(totalCount, visibleCount, entries) {
  const button = document.getElementById('loadOlder');
  if (!button || !loadOlderWrap) return;

  if (state.anchoredEntryId) {
    const anchorIndex = entries.findIndex(entry => entry.id === state.anchoredEntryId);
    const hiddenOlderCount = anchorIndex === -1 ? 0 : Math.max(anchorIndex + 1 - state.visibleEntryCount, 0);
    loadOlderWrap.hidden = hiddenOlderCount === 0;
    const nextCount = Math.min(hiddenOlderCount, LOAD_MORE_COUNT);
    button.textContent = hiddenOlderCount > 0
      ? `古いログを${nextCount}件読む（あと${hiddenOlderCount}件）`
      : '古いログを読む';
    return;
  }

  const hiddenCount = Math.max(totalCount - visibleCount, 0);
  loadOlderWrap.hidden = hiddenCount === 0;
  const nextCount = Math.min(hiddenCount, LOAD_MORE_COUNT);
  button.textContent = hiddenCount > 0
    ? `古いログを${nextCount}件読む（あと${hiddenCount}件）`
    : '古いログを読む';
}

export function updateReturnLatestButton() {
  if (!returnLatestWrap) return;
  if (!state.anchoredEntryId) {
    returnLatestWrap.hidden = true;
    return;
  }
  const anchorIndex = state.allEntries.findIndex(e => e.id === state.anchoredEntryId);
  const caughtUp = anchorIndex !== -1 &&
    state.newerEntryCount >= state.allEntries.length - anchorIndex - 1;
  returnLatestWrap.hidden = caughtUp;
}

export function updateLoadNewerButton(entries) {
  if (!loadNewerWrap) return;
  if (!state.anchoredEntryId) {
    loadNewerWrap.hidden = true;
    return;
  }
  const anchorIndex = entries.findIndex(entry => entry.id === state.anchoredEntryId);
  const hiddenNewerCount = anchorIndex === -1 ? 0 : Math.max(entries.length - anchorIndex - 1 - state.newerEntryCount, 0);
  loadNewerWrap.hidden = hiddenNewerCount === 0;
  const button = document.getElementById('loadNewer');
  if (!button) return;
  const nextCount = Math.min(hiddenNewerCount, LOAD_MORE_COUNT);
  button.textContent = `新しいログを${nextCount}件読む（あと${hiddenNewerCount}件）`;
}

// ---- スクロール ----

export function scrollToLatest(force = false) {
  if (state.anchoredEntryId) return;
  if (!force && state.visibleEntryCount > INITIAL_VISIBLE_COUNT) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
    });
  });
}

// ---- ハッシュ・ハイライト ----

export function ensureHashedEntryVisible() {
  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#entry-')) return;
  const id = hash.replace('#entry-', '');
  const index = state.allEntries.findIndex(item => item.id === id);
  if (index === -1) return;
  if (state.anchoredEntryId !== id) {
    state.anchoredEntryId = id;
    state.visibleEntryCount = INITIAL_VISIBLE_COUNT;
  }
}

export function highlightEntryFromHash() {
  document.querySelectorAll('.entry.is-highlighted').forEach(el => {
    el.classList.remove('is-highlighted');
  });

  const hash = window.location.hash;
  if (!hash || !hash.startsWith('#entry-')) return;

  const target = document.querySelector(hash);
  if (!target) return;

  target.classList.add('is-highlighted');

  requestAnimationFrame(() => {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  // 既読カウントと同じ秒数（1.8秒）待ってからハイライトを消す
  setTimeout(() => {
    target.classList.remove('is-highlighted');
    // URLのハッシュを削除（ページをスクロールさせないために history.replaceState を使用）
    if (window.location.hash === hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, VIEW_COUNT_DELAY_MS);
}

// ---- 共有 ----

export function shareEntry(id) {
  const entry = state.allEntries.find(item => item.id === id);
  if (!entry) return;

  const shareModal = document.getElementById('shareModal');
  const loaderWrap = document.getElementById('sharePixelLoader')?.parentElement;
  if (loaderWrap) {
    const fresh = loaderWrap.cloneNode(true);
    loaderWrap.replaceWith(fresh);
  }
  shareModal?.classList.add('is-open');
  lockScroll();

  setTimeout(() => {
    shareModal?.classList.remove('is-open');
    unlockScroll();

    const url = `${location.origin}${location.pathname}#entry-${id}`;
    const shareTitle = `えんぴつだいあろーぐ。 / ${entry.date || ''}`.trim();
    const shareText = shareTitle;

    if (navigator.share) {
      navigator.share({ title: shareTitle, text: shareText, url }).catch(() => {});
    } else {
      const textToCopy = `${shareTitle}\n${url}`;
      navigator.clipboard.writeText(textToCopy).then(() => {
        alert('共有テキストをコピーしました');
      }).catch(() => {
        prompt('この内容をコピーしてください', textToCopy);
      });
    }
  }, 650);
}

export function bindShareButtons() {
  document.querySelectorAll('[data-share-id]').forEach(button => {
    button.addEventListener('click', () => {
      shareEntry(button.dataset.shareId);
    });
  });
}

// ---- 既読カウント ----

export function syncViewCountsToDOM(entryId, count) {
  const badge = document.querySelector(`[data-view-count-id="${entryId}"]`);
  if (!badge) return;

  const numberEl = badge.querySelector('.view-count-number');
  const plusEl   = badge.querySelector('.view-count-plus');

  if (numberEl) {
    numberEl.classList.remove('is-bumping');
    void numberEl.offsetWidth; // reflow でアニメーションをリセット
    numberEl.textContent = String(count);
    numberEl.classList.add('is-bumping');
    numberEl.addEventListener('animationend', () => {
      numberEl.classList.remove('is-bumping');
    }, { once: true });
  }

  if (plusEl) {
    plusEl.classList.remove('is-bumping');
    void plusEl.offsetWidth;
    plusEl.classList.add('is-bumping');
    plusEl.addEventListener('animationend', () => {
      plusEl.classList.remove('is-bumping');
    }, { once: true });
  }
}

export function setupViewObservers() {
  if (!('IntersectionObserver' in window)) return;

  if (state.viewObserver) {
    state.viewObserver.disconnect();
  }

  const seenIds = new Set(loadSeenEntries());
  console.log('[counts] seenIds on setup:', [...seenIds]);
  const pendingTimers = new Map();

  state.viewObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const target = entry.target;
      const entryIdValue = target.dataset.entryId;
      if (!entryIdValue || seenIds.has(entryIdValue)) return;

      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
        if (pendingTimers.has(entryIdValue)) return;

        const timerId = window.setTimeout(async () => {
          if (seenIds.has(entryIdValue)) return;
          console.log('[counts] bump triggered for entry:', entryIdValue);

          seenIds.add(entryIdValue);
          saveSeenEntries([...seenIds]);
          localStorage.setItem(LAST_READ_ID_KEY, entryIdValue);

          const changed = await bumpSharedCounts([entryIdValue]);
          if (changed && changed[entryIdValue] != null) {
            state.sharedCounts[entryIdValue] = Number(changed[entryIdValue]);
            syncViewCountsToDOM(entryIdValue, state.sharedCounts[entryIdValue]);
          }

          if (state.viewObserver) {
            state.viewObserver.unobserve(target);
          }

          pendingTimers.delete(entryIdValue);
        }, VIEW_COUNT_DELAY_MS);

        pendingTimers.set(entryIdValue, timerId);
        return;
      }

      if (pendingTimers.has(entryIdValue)) {
        clearTimeout(pendingTimers.get(entryIdValue));
        pendingTimers.delete(entryIdValue);
      }
    });
  }, {
    threshold: [0.6]
  });

  document.querySelectorAll('.entry[data-entry-id]').forEach(entryEl => {
    const entryIdValue = entryEl.dataset.entryId;
    if (!seenIds.has(entryIdValue)) {
      state.viewObserver.observe(entryEl);
    }
  });
}

// ---- ピクセルロード・リビール ----

export function triggerPixelLoad(node) {
  node.classList.add('is-visible');

  if (!node.classList.contains('entry')) return;

  const bubble = node.querySelector('.bubble');
  if (!bubble) return;

  disableScroll();
  bubble.classList.add('loading-state');

  const loader = document.createElement('div');
  loader.className = 'pixel-loader';
  loader.innerHTML =
    '<div class="pixel-loader-bar">' +
    '<span></span><span></span><span></span><span></span><span></span>' +
    '</div>' +
    '<div class="pixel-loader-label">LOADING</div>';
  bubble.insertBefore(loader, bubble.firstChild);

  window.setTimeout(() => {
    bubble.classList.remove('loading-state');
    loader.classList.add('done');
    enableScroll();
    window.setTimeout(() => loader.remove(), 150);
  }, 900);
}

export function animateEntriesInOrder(alreadyVisibleIds = new Set()) {
  const nodes = [...document.querySelectorAll('.entry, .day-divider')];
  if (!nodes.length) return;

  nodes.forEach(node => node.classList.remove('is-visible'));

  if (state.revealObserver) state.revealObserver.disconnect();

  state.revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      state.revealObserver.unobserve(entry.target);
      triggerPixelLoad(entry.target);
    });
  }, { threshold: 0.5 });

  nodes.forEach(node => {
    // day-divider は即表示、すでに表示済みのエントリもアニメーションなしで即表示
    if (node.classList.contains('day-divider') ||
        (node.dataset.entryId && alreadyVisibleIds.has(node.dataset.entryId))) {
      node.classList.add('is-visible');
    } else {
      state.revealObserver.observe(node);
    }
  });
}

// ---- ナビゲーション ----

export function showMoreEntries() {
  const beforeHeight  = document.documentElement.scrollHeight;
  const beforeScrollY = window.scrollY;

  if (state.anchoredEntryId) {
    const anchorIndex = state.allEntries.findIndex(entry => entry.id === state.anchoredEntryId);
    if (anchorIndex === -1) return;

    const currentStart = Math.max(anchorIndex - state.visibleEntryCount + 1, 0);
    const nextStart    = Math.max(currentStart - LOAD_MORE_COUNT, 0);
    state.visibleEntryCount = anchorIndex - nextStart + 1;

    if (history.replaceState) {
      history.replaceState(null, '', location.pathname + location.search);
    }

    render();

    requestAnimationFrame(() => {
      const afterHeight = document.documentElement.scrollHeight;
      window.scrollTo({
        top: beforeScrollY + (afterHeight - beforeHeight),
        behavior: 'auto'
      });
    });
    return;
  }

  const total = state.allEntries.length;
  state.visibleEntryCount = Math.min(state.visibleEntryCount + LOAD_MORE_COUNT, total);

  render();

  requestAnimationFrame(() => {
    const afterHeight = document.documentElement.scrollHeight;
    window.scrollTo({
      top: beforeScrollY + (afterHeight - beforeHeight),
      behavior: 'auto'
    });
  });
}

export function showNewerEntries() {
  if (!state.anchoredEntryId) return;
  const anchorIndex = state.allEntries.findIndex(entry => entry.id === state.anchoredEntryId);
  if (anchorIndex === -1) return;
  const maxNewer = state.allEntries.length - anchorIndex - 1;
  state.newerEntryCount = Math.min(state.newerEntryCount + LOAD_MORE_COUNT, maxNewer);
  if (history.replaceState) {
    history.replaceState(null, '', location.pathname + location.search);
  }
  render();
}

export function returnToLatest() {
  const modal     = document.getElementById('returnLatestModal');
  const loaderWrap = document.getElementById('returnLatestPixelLoader')?.parentElement;
  if (loaderWrap) {
    const fresh = loaderWrap.cloneNode(true);
    loaderWrap.replaceWith(fresh);
  }
  modal?.classList.add('is-open');
  lockScroll();

  setTimeout(() => {
    modal?.classList.remove('is-open');
    unlockScroll();

    state.anchoredEntryId   = null;
    state.newerEntryCount   = 0;
    state.visibleEntryCount = INITIAL_VISIBLE_COUNT + INITIAL_EXTRA_COUNT;

    if (history.replaceState) {
      history.replaceState(null, '', location.pathname + location.search);
    }

    render();

    if (state.revealObserver) state.revealObserver.disconnect();
    document.querySelectorAll('.entry, .day-divider').forEach(node => {
      node.classList.add('is-visible');
    });

    scrollToLatest(true);
  }, 650);
}

export function handleHashChange() {
  const hash = window.location.hash;
  state.newerEntryCount = 0;
  if (hash && hash.startsWith('#entry-')) {
    state.anchoredEntryId   = hash.replace('#entry-', '');
    state.visibleEntryCount = INITIAL_VISIBLE_COUNT;
  } else {
    state.anchoredEntryId   = null;
    state.visibleEntryCount = INITIAL_VISIBLE_COUNT;
  }
  render();
}

// ---- メインレンダー ----

export function render() {
  try {
    ensureHashedEntryVisible();

    if (!state.allEntries.length) {
      if (loadOlderWrap)    loadOlderWrap.hidden    = true;
      if (returnLatestWrap) returnLatestWrap.hidden  = true;
      if (loadNewerWrap)    loadNewerWrap.hidden     = true;
      entriesEl.innerHTML = '<div class="empty">まだ投稿がありません。</div>';
      return;
    }

    const visibleEntries = getVisibleEntries(state.allEntries);
    const dayLabels      = enumerateDayLabels(state.allEntries);
    updateLoadOlderButton(state.allEntries.length, visibleEntries.length, state.allEntries);
    updateReturnLatestButton();
    updateLoadNewerButton(state.allEntries);

    const htmlParts = [];

    visibleEntries.forEach((entry) => {
      const labels = dayLabels.get(`before-${entry.id}`) || [];
      labels.forEach((label) => {
        htmlParts.push(`
          <div class="day-divider">
            <span>${escapeHtml(label)}</span>
          </div>
        `);
      });

      const imageSrc  = normalizeImagePath(entry.image || '');
      const imageHtml = imageSrc
        ? `
          <div class="entry-media">
            <img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(entry.caption || entry.text || entry.date || 'image')}" />
          </div>
          ${entry.caption ? `<div class="entry-caption">${escapeHtml(entry.caption)}</div>` : ''}
        `
        : '';

      const textHtml = entry.text
        ? `<p class="entry-text">${escapeHtml(entry.text)}</p>`
        : '';

      const sharedCount  = state.sharedCounts[entry.id];
      const displayCount = state.countsLoaded ? (sharedCount !== undefined ? sharedCount : 0) : '';

      htmlParts.push(`
        <article class="entry" id="entry-${escapeHtml(entry.id)}" data-entry-id="${escapeHtml(entry.id)}">
          <div class="bubble">
            <div class="stamp">
              <span class="author"><svg class="author-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>${escapeHtml(entry.author || '')}</span>
              <span>${escapeHtml(formatOnlyTime(entry.createdAt))}</span>
            </div>

            ${imageHtml}
            ${imageHtml && textHtml ? '<div style="height:10px"></div>' : ''}
            ${textHtml}

            <div class="entry-actions">
              <span class="view-count" data-view-count-id="${escapeHtml(entry.id)}" aria-label="既読カウント">
                <span class="view-count-label">既読：</span>
                <span class="view-count-number">${displayCount}</span>
                <span class="view-count-plus">+1</span>
              </span>

              <button class="icon-btn" type="button" data-share-id="${escapeHtml(entry.id)}" aria-label="共有">
                <svg viewBox="0 0 24 24">
                  <path d="M22 2L11 13"></path>
                  <path d="M22 2l-7 20-4-9-9-4z"></path>
                </svg>
              </button>

              <button class="icon-btn admin-only" type="button" data-edit-id="${escapeHtml(entry.id)}" aria-label="編集">
                <svg viewBox="0 0 24 24">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
              </button>
            </div>
          </div>
        </article>
      `);
    });

    // innerHTML 差し替え前に表示済みエントリの ID を記録
    const alreadyVisibleIds = new Set(
      [...document.querySelectorAll('.entry.is-visible[data-entry-id]')]
        .map(el => el.dataset.entryId)
    );

    entriesEl.innerHTML = htmlParts.join('');

    bindShareButtons();
    setupViewObservers();
    animateEntriesInOrder(alreadyVisibleIds);

    if (state.anchoredEntryId) {
      highlightEntryFromHash();
    } else if (!state.initialScrollDone) {
      state.initialScrollDone = true;
      // 初回スクロールは main.js の init() で body 表示と一括管理
    } else {
      scrollToLatest();
    }
  } catch (error) {
    console.error('[render] failed:', error);
    entriesEl.innerHTML = '<div class="empty">表示中にエラーが発生しました。コンソールを確認してください。</div>';
  }
}
