/* ===== render.js — レンダリング・ナビゲーション・オブザーバー ===== */

import { INITIAL_VISIBLE_COUNT, INITIAL_EXTRA_COUNT, LOAD_MORE_COUNT, VIEW_COUNT_DELAY_MS, LAST_READ_ID_KEY } from './config.js';
import { state } from './state.js';
import { disableScroll, enableScroll, lockScroll, unlockScroll } from './scroll.js';
import { escapeHtml, normalizeImagePath, formatOnlyTime, enumerateDayLabels } from './utils.js';
import { loadSeenEntries, saveSeenEntries, loadSharedCounts, bumpSharedCounts, syncLastReaderProfile, getReaderId } from './data.js';

const entriesEl        = document.getElementById('entries');
const loadOlderWrap    = document.getElementById('loadOlderWrap');
const returnLatestWrap = document.getElementById('returnLatestWrap');
const loadNewerWrap    = document.getElementById('loadNewerWrap');
const pendingCountAnimationTimers = new Map();

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
  const loaderWrap = document.getElementById('shareLoaderWrap');
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

const VIEW_COUNT_ANIMATION_DELAY_MS = 700;

function formatDisplayViewCount(count) {
  return String(Math.max(Number(count || 0) - 1, 0));
}

// 初期表示用：即時・アニメなし
export function syncViewCountsToDOM(entryId, count) {
  const badge = document.querySelector(`[data-view-count-id="${entryId}"]`);
  if (!badge) return;
  const numberEl = badge.querySelector('.view-count-number');
  if (numberEl) numberEl.textContent = formatDisplayViewCount(count);
}

// bump後用：700ms 遅延 + countBlink + plusFlash
function bumpViewCountInDOM(entryId, count) {
  const badge = document.querySelector(`[data-view-count-id="${entryId}"]`);
  if (!badge) return;

  const numberEl = badge.querySelector('.view-count-number');
  const plusEl   = badge.querySelector('.view-count-plus');

  if (pendingCountAnimationTimers.has(entryId)) {
    clearTimeout(pendingCountAnimationTimers.get(entryId));
  }

  const timerId = window.setTimeout(() => {
    if (numberEl) {
      numberEl.classList.remove('is-bumping');
      void numberEl.offsetWidth;
      numberEl.textContent = formatDisplayViewCount(count);
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

    pendingCountAnimationTimers.delete(entryId);
  }, VIEW_COUNT_ANIMATION_DELAY_MS);

  pendingCountAnimationTimers.set(entryId, timerId);
}

function formatLastViewedLabel(timestamp) {
  const viewedAt = new Date(timestamp).getTime();
  if (!viewedAt) return '';
  const diffMs = Date.now() - viewedAt;
  if (diffMs < 5 * 60 * 1000) return 'あしあと：たった今';
  const diffMin = Math.floor(diffMs / (60 * 1000));
  if (diffMin < 31) return 'あしあと：ちょっと前';
  if (diffMin < 60) return 'あしあと：30分くらい前';
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `あしあと：${diffHour}時間前`;
  const diffDay = Math.floor(diffHour / 24);
  return `あしあと：${diffDay}日前`;
}

export function syncLastViewedToDOM(entryId, timestamp) {
  const badge = document.querySelector(`[data-view-count-id="${entryId}"]`);
  if (!badge) return;
  const labelEl = badge.querySelector('.view-last-read');
  if (!labelEl) return;
  const label = formatLastViewedLabel(timestamp);
  labelEl.textContent = label;
  labelEl.hidden = !label;
}

function isRecentReaderCrossed(timestamp) {
  const viewedAt = new Date(timestamp).getTime();
  if (!viewedAt) return false;
  return (Date.now() - viewedAt) < 31 * 60 * 1000;
}

// 同一ページロード内の多重BUMP対策（メモリ変数）
let _readerCrossedShownSignature = null;
let _readerCrossedOpenTimer = null;

function getReaderCrossedPriority(name, msg) {
  if (name && msg) return 4;
  if (name) return 3;
  if (msg) return 2;
  return 1;
}

function isSelfReader(readerId) {
  return Boolean(readerId) && getReaderId() === readerId;
}

function isSameNamedReader(name) {
  if (!name) return false;
  const myName = (localStorage.getItem('enpitu-reader-name') || '').trim();
  return Boolean(myName) && myName === String(name).trim();
}

function resetReaderCrossedCheck() {
  _readerCrossedShownSignature = null;
}

function maybeSyncMyReaderProfile() {
  const myName = localStorage.getItem('enpitu-reader-name') || '';
  const myMsg  = localStorage.getItem('enpitu-reader-msg')  || '';
  if (!myName && !myMsg) return;

  const signature = `${myName}\n${myMsg}`;
  const alreadyCurrentOnServer =
    state.siteReaderId === getReaderId() &&
    state.siteReaderName === myName &&
    state.siteReaderMsg === myMsg;

  if (alreadyCurrentOnServer || state.lastSyncedReaderProfileSignature === signature || state.readerProfileSyncInFlight) {
    return;
  }

  state.readerProfileSyncInFlight = true;
  syncLastReaderProfile('', { name: myName, msg: myMsg }).then((changed) => {
    if (changed?.ok) {
      state.lastSyncedReaderProfileSignature = signature;
      state.siteReaderName = myName;
      state.siteReaderMsg = myMsg;
      state.siteReaderId = getReaderId();
    }
  }).catch(() => {}).finally(() => {
    state.readerProfileSyncInFlight = false;
  });
}

function openReaderCrossedModal(name, msg) {
  const displayName = name || '名無しの読者';
  const displayMsg = msg || '';
  const signature = `${displayName}\n${displayMsg}`;
  const nextPriority = getReaderCrossedPriority(name, displayMsg);
  const currentPriority = _readerCrossedShownSignature
    ? getReaderCrossedPriority(
        _readerCrossedShownSignature.split('\n')[0] === '名無しの読者' ? '' : _readerCrossedShownSignature.split('\n')[0],
        _readerCrossedShownSignature.split('\n').slice(1).join('\n')
      )
    : 0;

  // 同一ページロード内：実名表示済みなら "名無しの読者" で上書きしない
  if (!name && _readerCrossedShownSignature && !_readerCrossedShownSignature.startsWith('名無しの読者\n')) return;
  // 自分と同じ表示名の読者はスルーする
  if (isSameNamedReader(name)) return;
  // 同一ページロード内：より情報量の少ないプロフィールでは上書きしない
  if (_readerCrossedShownSignature && nextPriority < currentPriority) return;
  // 同一ページロード内：同じ名前・同じコメントは再表示しない
  if (_readerCrossedShownSignature === signature) return;

  const modal = document.getElementById('readerCrossedModal');
  const profileEl = document.getElementById('readerCrossedProfile');
  const nameEl = document.getElementById('readerCrossedName');
  const msgEl = document.getElementById('readerCrossedMsg');
  if (!modal || !profileEl) return;
  if (modal.classList.contains('is-open')) return;

  if (nameEl) nameEl.textContent = `${displayName}さん`;
  if (msgEl) msgEl.textContent = displayMsg;
  if (msgEl) msgEl.hidden = !displayMsg;
  profileEl.hidden = false;

  _readerCrossedShownSignature = signature;
  if (_readerCrossedOpenTimer) {
    clearTimeout(_readerCrossedOpenTimer);
  }
  _readerCrossedOpenTimer = window.setTimeout(() => {
    const welcomeOpen = document.getElementById('aboutModal')?.classList.contains('is-open');
    modal.style.zIndex = welcomeOpen ? '49' : '';
    modal.classList.add('is-open');
    lockScroll();
    _readerCrossedOpenTimer = null;
  }, 150);
}

function markCountIds(ids, requested = true) {
  ids.forEach((id) => {
    state.requestedCountIds[id] = requested;
  });
}

function mergeSharedCounts(payload, { animate = false } = {}) {
  const {
    counts = {},
    lastViewedAt = {},
    siteReaderName = '',
    siteReaderMsg = '',
    siteReaderId = '',
  } = payload || {};
  Object.entries(counts).forEach(([id, count]) => {
    state.sharedCounts[id] = Number(count);
    if (animate) {
      bumpViewCountInDOM(id, state.sharedCounts[id]);
    } else {
      syncViewCountsToDOM(id, state.sharedCounts[id]);
    }
  });
  Object.entries(lastViewedAt).forEach(([id, timestamp]) => {
    state.sharedLastViewed[id] = timestamp;
    syncLastViewedToDOM(id, timestamp);
  });
  if (typeof siteReaderName === 'string') {
    state.siteReaderName = siteReaderName;
  }
  if (typeof siteReaderMsg === 'string') {
    state.siteReaderMsg = siteReaderMsg;
  }
  if (typeof siteReaderId === 'string') {
    state.siteReaderId = siteReaderId;
  }
  if (Object.keys(counts).length || Object.keys(lastViewedAt).length || siteReaderName || siteReaderMsg || siteReaderId) {
    state.countsLoaded = true;
  }
}

function loadVisibleEntryCounts(visibleEntries) {
  if (state.deferInitialVisibleCountLoad) {
    state.deferInitialVisibleCountLoad = false;
    return;
  }

  const visibleIds = visibleEntries.map((entry) => entry.id).filter(Boolean);
  const missingIds = visibleIds.filter((id) => !state.requestedCountIds[id]);
  if (!missingIds.length) return;

  markCountIds(missingIds, true);
  loadSharedCounts(missingIds).then((payload) => {
    mergeSharedCounts(payload);
    if (isRecentReaderCrossed(payload.siteReaderUpdatedAt) && !isSelfReader(payload.siteReaderId)) {
      openReaderCrossedModal(payload.siteReaderName || '', payload.siteReaderMsg || '');
    }
    // counts-get 完了後に必要な時だけ自分の名前を書き込む
    maybeSyncMyReaderProfile();
  }).catch((error) => {
    console.error('[counts] visible load failed:', error);
    markCountIds(missingIds, false);
  });
}

export function setupViewObservers() {
  if (!('IntersectionObserver' in window)) return;

  if (state.viewObserver) {
    state.viewObserver.disconnect();
  }

  state.viewPendingTimers.forEach((timerId) => clearTimeout(timerId));
  state.viewPendingTimers.clear();

  if (!state.viewSeenIds) {
    state.viewSeenIds = new Set(loadSeenEntries());
  }
  if (!state.footprintUpdatedIds) {
    state.footprintUpdatedIds = new Set();
  }
  const seenIds = state.viewSeenIds;
  const footprintUpdatedIds = state.footprintUpdatedIds;
  const pendingTimers = state.viewPendingTimers;

  state.viewObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const target = entry.target;
      const entryIdValue = target.dataset.entryId;
      if (!entryIdValue) return;

      // 既読済み → カウントは増やさず、あしあと時間だけ上書き（ページロードごと1回・is-ready後のみ）
      if (seenIds.has(entryIdValue)) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6 && !footprintUpdatedIds.has(entryIdValue) && document.body.classList.contains('is-ready')) {
          footprintUpdatedIds.add(entryIdValue);
          const readerInfo = {
            name: localStorage.getItem('enpitu-reader-name') || '',
            msg:  localStorage.getItem('enpitu-reader-msg')  || '',
          };
          bumpSharedCounts([entryIdValue], readerInfo, { footprintOnly: true }).then(changed => {
            mergeSharedCounts(changed);
          }).catch(() => {});
          if (state.viewObserver) {
            state.viewObserver.unobserve(target);
          }
        }
        return;
      }

      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
        if (pendingTimers.has(entryIdValue)) return;

        const timerId = window.setTimeout(async () => {
          try {
            if (seenIds.has(entryIdValue)) return;
            seenIds.add(entryIdValue);
            saveSeenEntries([...seenIds]);
            localStorage.setItem(LAST_READ_ID_KEY, entryIdValue);

            const readerInfo = {
              name: localStorage.getItem('enpitu-reader-name') || '',
              msg:  localStorage.getItem('enpitu-reader-msg')  || '',
            };
          const changed = await bumpSharedCounts([entryIdValue], readerInfo);
          mergeSharedCounts(changed, { animate: true });
          if (isRecentReaderCrossed(changed?.previousSiteReaderUpdatedAt) && !isSelfReader(changed?.previousSiteReaderId)) {
              const crossedName = changed?.previousSiteReaderName || '';
              const crossedMsg  = changed?.previousSiteReaderMsg  || '';
              openReaderCrossedModal(crossedName, crossedMsg);
            }

            if (state.viewObserver) {
              state.viewObserver.unobserve(target);
            }
          } finally {
            pendingTimers.delete(entryIdValue);
          }
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
    // 未読 or 既読だがまだフットプリント更新していない entry を監視
    if (!seenIds.has(entryIdValue) || !footprintUpdatedIds.has(entryIdValue)) {
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
    if (nextStart === currentStart) return;
    state.visibleEntryCount = anchorIndex - nextStart + 1;
    resetReaderCrossedCheck();

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
  const nextVisibleEntryCount = Math.min(state.visibleEntryCount + LOAD_MORE_COUNT, total);
  if (nextVisibleEntryCount === state.visibleEntryCount) return;
  state.visibleEntryCount = nextVisibleEntryCount;
  resetReaderCrossedCheck();

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
  const nextNewerEntryCount = Math.min(state.newerEntryCount + LOAD_MORE_COUNT, maxNewer);
  if (nextNewerEntryCount === state.newerEntryCount) return;
  state.newerEntryCount = nextNewerEntryCount;
  resetReaderCrossedCheck();
  if (history.replaceState) {
    history.replaceState(null, '', location.pathname + location.search);
  }
  render();
}

export function returnToLatest() {
  const modal     = document.getElementById('returnLatestModal');
  const loaderWrap = document.getElementById('returnLatestLoaderWrap');
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
    const sharedLastViewed = state.sharedLastViewed || {};

    if (!state.allEntries.length) {
      if (loadOlderWrap)    loadOlderWrap.hidden    = true;
      if (returnLatestWrap) returnLatestWrap.hidden  = true;
      if (loadNewerWrap)    loadNewerWrap.hidden     = true;
      entriesEl.innerHTML = '<div class="empty">まだ投稿がありません。</div>';
      return;
    }

    const visibleEntries = getVisibleEntries(state.allEntries);

    // 最新エントリが表示中のときだけ今日までの空白日を埋める
    const lastVisibleId = visibleEntries[visibleEntries.length - 1]?.id;
    const lastOverallId = state.allEntries[state.allEntries.length - 1]?.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayLabels = enumerateDayLabels(
      state.allEntries,
      lastVisibleId === lastOverallId ? { trailingDate: today } : {}
    );

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
      const displayCount = state.countsLoaded
        ? (sharedCount !== undefined ? formatDisplayViewCount(sharedCount) : '0')
        : '';
      const lastViewedLabel = formatLastViewedLabel(sharedLastViewed[entry.id]);

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
                <span class="view-last-read"${lastViewedLabel ? '' : ' hidden'}>${escapeHtml(lastViewedLabel)}</span>
              </span>

              <button class="icon-btn" type="button" data-share-id="${escapeHtml(entry.id)}" aria-label="共有">
                <svg viewBox="0 0 24 24">
                  <path d="M22 2L11 13"></path>
                  <path d="M22 2l-7 20-4-9-9-4z"></path>
                </svg>
              </button>

              <button class="icon-btn admin-only" type="button" data-edit-id="${escapeHtml(entry.id)}" aria-label="編集">
                <svg viewBox="0 0 24 24">
                  <path d="M8 4.5H6.8A2.8 2.8 0 0 0 4 7.3v9.9A2.8 2.8 0 0 0 6.8 20h9.9a2.8 2.8 0 0 0 2.8-2.8V16"></path>
                  <path d="M11.3 14.8l-2.8.4.4-2.8 8.5-8.5a1.8 1.8 0 0 1 2.6 0l.2.2a1.8 1.8 0 0 1 0 2.6z"></path>
                  <path d="M16.6 4.7l2.8 2.8"></path>
                </svg>
              </button>
            </div>
          </div>
        </article>
      `);
    });

    // 最後のエントリ以降の空白日（投稿のない日）
    const trailingLabels = dayLabels.get('after-last') || [];
    trailingLabels.forEach((label) => {
      htmlParts.push(`
        <div class="day-divider">
          <span>${escapeHtml(label)}</span>
        </div>
      `);
    });

    // innerHTML 差し替え前に表示済みエントリの ID を記録
    const alreadyVisibleIds = new Set(
      [...document.querySelectorAll('.entry.is-visible[data-entry-id]')]
        .map(el => el.dataset.entryId)
    );

    entriesEl.innerHTML = htmlParts.join('');

    bindShareButtons();
    loadVisibleEntryCounts(visibleEntries);
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
    entriesEl.innerHTML = '<div class="empty">エラーが発生しました。</div>';
  }
}
