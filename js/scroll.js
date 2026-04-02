/* ===== scroll.js — スクロールロック・アンロック ===== */

import { state } from './state.js';

const SCROLL_BLOCK_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', ' '];

function blockScrollWheel(e) { if (e.cancelable) e.preventDefault(); }
function blockScrollKey(e) {
  if (SCROLL_BLOCK_KEYS.includes(e.key)) e.preventDefault();
}

export function disableScroll() {
  if (state.loadingCount === 0 && state.modalLockCount === 0) {
    document.body.style.overflow = 'hidden';
    window.addEventListener('wheel',     blockScrollWheel, { passive: false });
    window.addEventListener('touchmove', blockScrollWheel, { passive: false });
    window.addEventListener('keydown',   blockScrollKey);
  }
  state.loadingCount++;
}

export function enableScroll() {
  state.loadingCount = Math.max(0, state.loadingCount - 1);
  if (state.loadingCount === 0 && state.modalLockCount === 0) {
    document.body.style.overflow = '';
    window.removeEventListener('wheel',     blockScrollWheel);
    window.removeEventListener('touchmove', blockScrollWheel);
    window.removeEventListener('keydown',   blockScrollKey);
  }
}

export function lockScroll() {
  document.body.style.overflow = 'hidden';
  if (state.modalLockCount === 0 && state.loadingCount === 0) {
    window.addEventListener('wheel',     blockScrollWheel, { passive: false });
    window.addEventListener('touchmove', blockScrollWheel, { passive: false });
    window.addEventListener('keydown',   blockScrollKey);
  }
  state.modalLockCount++;
}

export function unlockScroll() {
  state.modalLockCount = Math.max(0, state.modalLockCount - 1);
  if (state.modalLockCount === 0 && state.loadingCount === 0) {
    document.body.style.overflow = '';
    window.removeEventListener('wheel',     blockScrollWheel);
    window.removeEventListener('touchmove', blockScrollWheel);
    window.removeEventListener('keydown',   blockScrollKey);
  } else {
    document.body.style.overflow = 'hidden';
  }
}
