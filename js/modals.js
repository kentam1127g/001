/* ===== modals.js — モーダルイベントリスナー ===== */

import { INITIAL_VISIBLE_COUNT } from './config.js';
import { state } from './state.js';
import { lockScroll, unlockScroll } from './scroll.js';
import { render } from './render.js';

const aboutModal    = document.getElementById('aboutModal');
const writerModal   = document.getElementById('writerModal');
const newPostsModal = document.getElementById('newPostsModal');
const imageModal      = document.getElementById('imageModal');
const imageModalImg   = document.getElementById('imageModalImg');
const imageModalTitle  = document.getElementById('imageModalTitle');
const imageModalLoader = document.getElementById('imageModalLoader');
const imageModalAuthor = document.getElementById('imageModalAuthor');

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
  const entry  = media.closest('.entry');
  const text   = entry?.querySelector('.entry-text')?.textContent || '';
  const author = entry?.querySelector('.author')?.textContent?.trim() || '';
  imageModalImg.src = img.src;
  imageModalImg.alt = img.alt;
  imageModalTitle.textContent  = text.length > 12 ? text.slice(0, 12) + '...' : text;
  imageModalAuthor.textContent = author;
  imageModal.classList.add('is-open');
  lockScroll();
  if (imageModalLoader) {
    clearTimeout(imageLoaderTimer);
    imageModalLoader.classList.remove('hidden');
    imageLoaderTimer = window.setTimeout(() => imageModalLoader.classList.add('hidden'), 600);
  }
});

// ---- ランダムモーダル ----

document.getElementById('floatRandom')?.addEventListener('click', () => {
  if (!state.allEntries.length) return;
  const entry = state.allEntries[Math.floor(Math.random() * state.allEntries.length)];
  const randomModal = document.getElementById('randomModal');
  const loaderWrap  = document.getElementById('randomPixelLoader')?.parentElement;
  if (loaderWrap) {
    const fresh = loaderWrap.cloneNode(true);
    loaderWrap.replaceWith(fresh);
  }
  randomModal?.classList.add('is-open');
  lockScroll();
  setTimeout(() => {
    randomModal?.classList.remove('is-open');
    unlockScroll();
    state.anchoredEntryId   = entry.id;
    state.visibleEntryCount = INITIAL_VISIBLE_COUNT;
    if (history.replaceState) {
      history.replaceState(null, '', `${location.pathname}${location.search}#entry-${entry.id}`);
    }
    render();
  }, 650);
});
