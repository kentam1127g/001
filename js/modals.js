/* ===== modals.js — モーダルイベントリスナー ===== */

import { state } from './state.js';
import { lockScroll, unlockScroll } from './scroll.js';
import { render } from './render.js';
import { escapeHtml, normalizeImagePath, formatOnlyTime } from './utils.js';

const aboutModal    = document.getElementById('aboutModal');
const writerModal   = document.getElementById('writerModal');
const newPostsModal = document.getElementById('newPostsModal');
const imageModal      = document.getElementById('imageModal');
const imageModalImg   = document.getElementById('imageModalImg');
const imageModalLoader = document.getElementById('imageModalLoader');

let aboutLoaderTimer  = null;
let writerLoaderTimer = null;
let imageLoaderTimer  = null;

// ---- リロードモーダル ----

document.getElementById('topbarReload')?.addEventListener('click', () => {
  const reloadModal = document.getElementById('reloadModal');
  const loaderWrap = document.getElementById('reloadPixelLoader')?.parentElement;
  if (loaderWrap) {
    const fresh = loaderWrap.cloneNode(true);
    loaderWrap.replaceWith(fresh);
  }
  reloadModal?.classList.add('is-open');
  lockScroll();
  setTimeout(() => location.reload(), 450);
});

// ---- Aboutモーダル ----

document.getElementById('floatAbout')?.addEventListener('click', () => {
  aboutModal?.classList.add('is-open');
  lockScroll();
  const loader = document.getElementById('aboutModalLoader');
  if (loader) {
    clearTimeout(aboutLoaderTimer);
    loader.classList.remove('hidden');
    aboutLoaderTimer = window.setTimeout(() => loader.classList.add('hidden'), 300);
  }
});
document.getElementById('aboutModalClose')?.addEventListener('click', () => {
  aboutModal?.classList.remove('is-open');
  unlockScroll();
});
aboutModal?.addEventListener('click', (e) => {
  if (e.target === aboutModal) { aboutModal.classList.remove('is-open'); unlockScroll(); }
});

// ---- Writerモーダル ----

document.getElementById('floatWriter')?.addEventListener('click', () => {
  writerModal?.classList.add('is-open');
  lockScroll();
  const loader = document.getElementById('writerModalLoader');
  if (loader) {
    clearTimeout(writerLoaderTimer);
    loader.classList.remove('hidden');
    writerLoaderTimer = window.setTimeout(() => loader.classList.add('hidden'), 300);
  }
});
document.getElementById('writerModalClose')?.addEventListener('click', () => {
  writerModal?.classList.remove('is-open');
  unlockScroll();
});
writerModal?.addEventListener('click', (e) => {
  if (e.target === writerModal) { writerModal.classList.remove('is-open'); unlockScroll(); }
});

// ---- 新着投稿モーダル ----

document.getElementById('newPostsModalClose')?.addEventListener('click', () => {
  newPostsModal?.classList.remove('is-open');
  unlockScroll();
});
newPostsModal?.addEventListener('click', (e) => {
  if (e.target === newPostsModal) { newPostsModal.classList.remove('is-open'); unlockScroll(); }
});

// ---- 画像モーダル ----

document.getElementById('imageModalClose')?.addEventListener('click', () => {
  imageModal.classList.remove('is-open');
  imageModalImg.src = '';
  unlockScroll();
});
imageModal?.addEventListener('click', (e) => {
  if (e.target === imageModal) {
    imageModal.classList.remove('is-open');
    imageModalImg.src = '';
    unlockScroll();
  }
});

document.getElementById('entries')?.addEventListener('click', (e) => {
  const media = e.target.closest('.entry-media');
  if (!media) return;
  const img = media.querySelector('img');
  if (!img) return;
  imageModalImg.src = img.src;
  imageModalImg.alt = img.alt;
  imageModal.classList.add('is-open');
  lockScroll();
  if (imageModalLoader) {
    clearTimeout(imageLoaderTimer);
    imageModalLoader.classList.remove('hidden');
    imageLoaderTimer = window.setTimeout(() => imageModalLoader.classList.add('hidden'), 600);
  }
});

// ---- ランダム投稿プレビュー ----

function buildPreviewHTML(entry) {
  const imageSrc    = normalizeImagePath(entry.image || '');
  const imageHtml   = imageSrc
    ? `<div class="entry-media"><img src="${escapeHtml(imageSrc)}" alt="${escapeHtml(entry.caption || entry.text || 'image')}" /></div>`
    : '';
  const captionHtml = (imageSrc && entry.caption)
    ? `<div class="entry-caption">${escapeHtml(entry.caption)}</div>`
    : '';
  const textHtml    = entry.text
    ? `<p class="entry-text">${escapeHtml(entry.text)}</p>`
    : '';
  const spacer = (imageHtml && textHtml) ? '<div style="height:10px"></div>' : '';
  return `
    <div class="preview-bubble bubble">
      <div class="stamp">
        <span class="author">
          <svg class="author-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>${escapeHtml(entry.author || '')}
        </span>
        <span>${escapeHtml(formatOnlyTime(entry.createdAt))}</span>
      </div>
      ${imageHtml}
      ${captionHtml}
      ${spacer}
      ${textHtml}
    </div>
  `;
}

export function showEntryPreviewModal(entry, { skipLoader = false, onNavigate = null } = {}) {
  const modal      = document.getElementById('randomModal');
  const previewEl  = document.getElementById('randomPreview');
  const goBtn      = document.getElementById('randomGoToEntry');
  const closeBtn   = document.getElementById('randomModalClose');

  if (!modal || !previewEl || !goBtn) return;

  previewEl.hidden = true;
  previewEl.innerHTML = '';
  goBtn.hidden = true;

  const loaderWrap = document.getElementById('randomPixelLoader')?.parentElement;
  if (loaderWrap) loaderWrap.hidden = false;

  modal.classList.add('is-open');
  lockScroll();

  const showPreview = () => {
    // loaderWrap はcloneNode後に付け替わっているので再取得
    const currentLoaderWrap = document.getElementById('randomPixelLoader')?.parentElement;
    if (currentLoaderWrap) currentLoaderWrap.hidden = true;
    previewEl.innerHTML = buildPreviewHTML(entry);
    previewEl.hidden = false;
    goBtn.hidden = false;
  };

  if (skipLoader) {
    showPreview();
  } else {
    if (loaderWrap) {
      const fresh = loaderWrap.cloneNode(true);
      loaderWrap.replaceWith(fresh);
    }
    setTimeout(showPreview, 650);
  }

  const close = () => {
    modal.classList.remove('is-open');
    unlockScroll();
    previewEl.hidden = true;
    previewEl.innerHTML = '';
    goBtn.hidden = true;
    modal.onclick   = null;
    goBtn.onclick   = null;
    if (closeBtn) closeBtn.onclick = null;
  };

  goBtn.onclick   = () => { close(); if (onNavigate) onNavigate(); };
  if (closeBtn) closeBtn.onclick = close;
  modal.onclick   = (e) => { if (e.target === modal) close(); };
}

document.getElementById('floatRandom')?.addEventListener('click', () => {
  if (!state.allEntries.length) return;
  const entry = state.allEntries[Math.floor(Math.random() * state.allEntries.length)];
  showEntryPreviewModal(entry, {
    skipLoader: false,
    onNavigate: () => {
      state.anchoredEntryId   = entry.id;
      state.visibleEntryCount = 4;
      state.newerEntryCount   = 3;
      if (history.replaceState) {
        history.replaceState(null, '', `${location.pathname}${location.search}#entry-${entry.id}`);
      }
      render();
    }
  });
});
