/* ===== modals.js — モーダルイベントリスナー ===== */

import { state } from './state.js';
import { lockScroll, unlockScroll } from './scroll.js';
import { render } from './render.js';
import { escapeHtml, normalizeImagePath } from './utils.js';

// ---- ページコンテンツ動的読み込み ----

const AUTHOR_ICON_SVG = '<svg class="author-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>';

export function renderAboutBody(body) {
  const el = document.getElementById('aboutModalBody');
  if (!el) return;
  el.innerHTML = '<p>' + escapeHtml(body).replace(/\n/g, '<br>') + '</p>';
}

export function renderWriterBody(writers) {
  const el = document.getElementById('writerModalBody');
  if (!el) return;
  el.innerHTML = writers.map((w, i) =>
    `<p>${AUTHOR_ICON_SVG}${escapeHtml(w.name)}</p>` +
    `<p>${escapeHtml(w.bio).replace(/\n/g, '<br>')}</p>` +
    (i < writers.length - 1 ? '<hr>' : '')
  ).join('');
}

async function loadPageContent() {
  try {
    const res = await fetch(`./content/pages/about.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) { const d = await res.json(); renderAboutBody(d.body || ''); }
  } catch {}
  try {
    const res = await fetch(`./content/pages/writer.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) { const d = await res.json(); if (d.writers) renderWriterBody(d.writers); }
  } catch {}
}

loadPageContent();

// ---- Pixel-loaderの注入 ----
// <template id="pixelLoaderTpl"> の内容を [data-loader] 要素に注入する

function createRandomSpecialLoader(label = 'SEARCHING...') {
  const frag = document.createDocumentFragment();
  const wrap = document.createElement('div');
  wrap.className = 'pixel-loader random-special-loader';
  wrap.innerHTML = `
    <div class="pixel-loader-bar" aria-hidden="true">
      <span></span><span></span><span></span><span></span><span></span>
    </div>
    <div class="pixel-loader-label"></div>
  `;
  const labelEl = wrap.querySelector('.pixel-loader-label');
  if (labelEl) labelEl.textContent = label;
  frag.appendChild(wrap);
  return frag;
}

function createPixelLoader(label = 'LOADING', variant = '') {
  if (variant === 'random-special') return createRandomSpecialLoader(label);
  const tpl = document.getElementById('pixelLoaderTpl');
  if (!tpl) return null;
  const frag = tpl.content.cloneNode(true);
  const labelEl = frag.querySelector('.pixel-loader-label');
  if (labelEl) labelEl.textContent = label;
  return frag;
}

document.querySelectorAll('[data-loader]').forEach(wrap => {
  const loader = createPixelLoader(wrap.dataset.loader || 'LOADING', wrap.dataset.loaderVariant || '');
  if (loader) wrap.appendChild(loader);
});

// ---- モーダル共通ヘルパー ----

function openModal(el) {
  el?.classList.add('is-open');
  lockScroll();
}

function closeModal(el) {
  el?.classList.remove('is-open');
  unlockScroll();
}

/**
 * 閉じるボタン＋オーバーレイクリックを一括設定。
 * onClose が指定された場合、閉じるときに実行される。
 */
function setupModal(modalEl, closeBtnId, onClose) {
  const doClose = () => { closeModal(modalEl); onClose?.(); };
  document.getElementById(closeBtnId)?.addEventListener('click', doClose);
  modalEl?.addEventListener('click', (e) => { if (e.target === modalEl) doClose(); });
}

/**
 * pixel-loaderアニメーションをリセットして再生する。
 * 内部HTMLを一旦クリアして再挿入することでCSSアニメーションを再スタートさせる。
 */
export function restartLoader(wrapEl) {
  if (!wrapEl) return;
  const label = wrapEl.dataset.loader || 'LOADING';
  const variant = wrapEl.dataset.loaderVariant || '';
  wrapEl.innerHTML = '';
  const loader = createPixelLoader(label, variant);
  if (loader) wrapEl.appendChild(loader);
}

/**
 * モーダルを開き、ローダーを duration ms 後に隠す。
 * timerRef は { value: timerId } の形で渡すことで clearTimeout に対応する。
 */
function openModalWithLoader(modalEl, loaderId, timerRef, duration = 300) {
  openModal(modalEl);
  const loader = document.getElementById(loaderId);
  if (!loader) return;
  clearTimeout(timerRef.value);
  loader.classList.remove('hidden');
  timerRef.value = window.setTimeout(() => loader.classList.add('hidden'), duration);
}

// ---- 各モーダル要素 ----

const aboutModal       = document.getElementById('aboutModal');
const writerModal      = document.getElementById('writerModal');
const newPostsModal    = document.getElementById('newPostsModal');
const readerCrossedModal = document.getElementById('readerCrossedModal');
const logoutConfirmModal = document.getElementById('logoutConfirmModal');
const imageModal       = document.getElementById('imageModal');
const imageModalImg    = document.getElementById('imageModalImg');
const imageModalLoader = document.getElementById('imageModalLoader');
const reloadModal      = document.getElementById('reloadModal');
const reloadConfirmModal = document.getElementById('reloadConfirmModal');

const aboutLoaderTimer  = { value: null };
const writerLoaderTimer = { value: null };
let   imageLoaderTimer  = null;

// ---- リロードモーダル ----

document.getElementById('topbarReload')?.addEventListener('click', () => {
  openModal(reloadConfirmModal);
});

const closeReloadConfirmModal = () => closeModal(reloadConfirmModal);

document.getElementById('reloadConfirmNo')?.addEventListener('click', closeReloadConfirmModal);
reloadConfirmModal?.addEventListener('click', (e) => {
  if (e.target === reloadConfirmModal) closeReloadConfirmModal();
});

document.getElementById('reloadConfirmYes')?.addEventListener('click', () => {
  closeModal(reloadConfirmModal);
  restartLoader(document.getElementById('reloadLoaderWrap'));
  openModal(reloadModal);
  setTimeout(() => location.reload(), 450);
});

// ---- Aboutモーダル ----

let aboutWelcomeMode = false;
let _welcomeOnEnter  = null;

function closeAboutModal() {
  if (aboutWelcomeMode) return;
  closeModal(aboutModal);
}

document.getElementById('aboutModalClose')?.addEventListener('click', closeAboutModal);
aboutModal?.addEventListener('click', (e) => { if (e.target === aboutModal) closeAboutModal(); });

document.getElementById('floatAbout')?.addEventListener('click', () =>
  openModalWithLoader(aboutModal, 'aboutModalLoader', aboutLoaderTimer));

document.getElementById('aboutEnterBtn')?.addEventListener('click', () => {
  localStorage.setItem('enpitu-visited', '1');
  aboutWelcomeMode = false;
  const titleEl   = document.getElementById('aboutModalTitle');
  const closeBtn  = document.getElementById('aboutModalClose');
  const enterWrap = document.getElementById('aboutEnterBtnWrap');
  if (titleEl)   titleEl.textContent = 'ようこそ';
  if (closeBtn)  closeBtn.hidden = false;
  if (enterWrap) enterWrap.hidden = true;
  closeModal(aboutModal);
  const cb = _welcomeOnEnter;
  _welcomeOnEnter = null;
  cb?.();
});

export function isWelcomeModalOpen() {
  return aboutWelcomeMode;
}

export function openWelcomeAboutModal(onEnter) {
  aboutWelcomeMode = true;
  _welcomeOnEnter  = onEnter || null;
  const titleEl   = document.getElementById('aboutModalTitle');
  const closeBtn  = document.getElementById('aboutModalClose');
  const enterWrap = document.getElementById('aboutEnterBtnWrap');
  if (titleEl)   titleEl.textContent = 'ようこそ';
  if (closeBtn)  closeBtn.hidden = true;
  if (enterWrap) enterWrap.hidden = false;
  openModalWithLoader(aboutModal, 'aboutModalLoader', aboutLoaderTimer);
}

// ---- Writerモーダル ----

document.getElementById('floatWriter')?.addEventListener('click', () =>
  openModalWithLoader(writerModal, 'writerModalLoader', writerLoaderTimer));
setupModal(writerModal, 'writerModalClose');

// ---- 新着投稿モーダル ----

setupModal(newPostsModal, 'newPostsModalClose');
setupModal(readerCrossedModal, 'readerCrossedModalClose');
logoutConfirmModal?.addEventListener('click', (e) => {
  if (e.target === logoutConfirmModal) closeModal(logoutConfirmModal);
});

// ---- 画像モーダル ----

function closeImageModal() {
  imageModal.classList.remove('is-open');
  imageModalImg.src = '';
  unlockScroll();
}

function openImageModalFromImage(img) {
  if (!img || !imageModalImg) return;
  imageModalImg.src = img.src;
  imageModalImg.alt = img.alt;
  openModal(imageModal);
  if (imageModalLoader) {
    clearTimeout(imageLoaderTimer);
    imageModalLoader.classList.remove('hidden');
    imageLoaderTimer = window.setTimeout(() => imageModalLoader.classList.add('hidden'), 600);
  }
}

document.getElementById('imageModalClose')?.addEventListener('click', closeImageModal);
imageModal?.addEventListener('click', (e) => { if (e.target === imageModal) closeImageModal(); });

document.getElementById('entries')?.addEventListener('click', (e) => {
  const img = e.target.closest('.entry-media')?.querySelector('img');
  if (!img) return;
  openImageModalFromImage(img);
});

document.getElementById('randomPreview')?.addEventListener('click', (e) => {
  const img = e.target.closest('.entry-media img');
  if (!img) return;
  openImageModalFromImage(img);
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
      </div>
      ${imageHtml}
      ${captionHtml}
      ${spacer}
      ${textHtml}
    </div>
  `;
}

export function showEntryPreviewModal(entry, { skipLoader = false, onNavigate = null } = {}) {
  const loadingModal = document.getElementById('randomModal');
  const previewModal = document.getElementById('randomPreviewModal');
  const previewEl    = document.getElementById('randomPreview');
  const goBtn        = document.getElementById('randomGoToEntry');
  const closeBtn     = document.getElementById('randomPreviewClose');

  if (!previewModal || !previewEl || !goBtn) return;

  const showPreview = () => {
    if (loadingModal) closeModal(loadingModal);
    previewEl.innerHTML = buildPreviewHTML(entry);
    openModal(previewModal);
  };

  if (skipLoader) {
    showPreview();
  } else {
    restartLoader(document.getElementById('randomLoaderWrap'));
    openModal(loadingModal);
    setTimeout(showPreview, 2000);
  }

  const close = () => {
    closeModal(previewModal);
    previewEl.innerHTML = '';
    previewModal.onclick = null;
    goBtn.onclick        = null;
    if (closeBtn) closeBtn.onclick = null;
  };

  goBtn.onclick  = () => { close(); if (onNavigate) onNavigate(); };
  if (closeBtn) closeBtn.onclick = close;
  previewModal.onclick = (e) => { if (e.target === previewModal) close(); };
}

// ---- 読者プロフィール ----

const READER_NAME_KEY = 'enpitu-reader-name';
const READER_MSG_KEY  = 'enpitu-reader-msg';

export function getReaderProfile() {
  return {
    name: localStorage.getItem(READER_NAME_KEY) || '',
    msg:  localStorage.getItem(READER_MSG_KEY)  || '',
  };
}

function updateReaderProfileBtn() {
  const btn      = document.getElementById('readerProfileBtn');
  const nameEl   = document.getElementById('readerProfileName');
  if (!btn || !nameEl) return;
  const { name } = getReaderProfile();
  if (name) {
    nameEl.textContent = `${name}さん`;
    nameEl.classList.remove('reader-profile-name--unset');
  } else {
    nameEl.textContent = '（お名前未設定）';
    nameEl.classList.add('reader-profile-name--unset');
  }
}

updateReaderProfileBtn();

const readerProfileModal = document.getElementById('readerProfileModal');

document.getElementById('readerProfileBtn')?.addEventListener('click', () => {
  const { name, msg } = getReaderProfile();
  const nameInput = document.getElementById('readerProfileNameInput');
  const msgInput  = document.getElementById('readerProfileMsgInput');
  if (nameInput) nameInput.value = name;
  if (msgInput)  msgInput.value  = msg;
  openModal(readerProfileModal);
});

setupModal(readerProfileModal, 'readerProfileModalClose');

document.getElementById('readerProfileSave')?.addEventListener('click', () => {
  const name = (document.getElementById('readerProfileNameInput')?.value || '').slice(0, 7).trim();
  const msg  = (document.getElementById('readerProfileMsgInput')?.value  || '').slice(0, 15).trim();
  localStorage.setItem(READER_NAME_KEY, name);
  localStorage.setItem(READER_MSG_KEY,  msg);
  updateReaderProfileBtn();
  closeModal(readerProfileModal);
});

export function showReaderCrossedProfile(name, msg) {
  const profileEl = document.getElementById('readerCrossedProfile');
  const nameEl    = document.getElementById('readerCrossedName');
  const msgEl     = document.getElementById('readerCrossedMsg');
  if (!profileEl) return;
  const displayName = name || '名無しの読者';
  if (nameEl) nameEl.textContent = `${displayName}さん`;
  if (msgEl)  msgEl.textContent  = msg || '';
  if (msgEl)  msgEl.hidden       = !msg;
  profileEl.hidden = false;
}

// ---- ランダム投稿 ----

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
