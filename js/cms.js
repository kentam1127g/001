/* ===== cms.js — CMS認証・投稿管理モーダル ===== */

import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { renderAboutBody, renderWriterBody } from './modals.js';
import { COUNTS_API_BASE, SEEN_STORAGE_KEY } from './config.js';

const GITHUB_REPO   = 'kentam1127g/001';
const GITHUB_BRANCH = 'main';
const AUTHOR_MAP    = {
  'kentam1127g': 'まつけん',
  'wakako38-dev': 'わかこ',
};

// ---- 認証 ----

function getDecapUser() {
  try {
    const raw = localStorage.getItem('decap-cms-user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function getToken()  { return getDecapUser()?.token || null; }
function getLogin()  { return getDecapUser()?.login || ''; }
function getAuthor() { return AUTHOR_MAP[getLogin()] || ''; }

function isLoggedIn() { return !!getToken(); }

export function applyAuthState() {
  const loggedIn = isLoggedIn();
  document.body.classList.toggle('is-admin', loggedIn);
  const loginStatusFloat = document.getElementById('loginStatusFloat');
  const writerLoginBtn   = document.getElementById('writerLoginBtn');
  const floatAbout = document.getElementById('floatAbout');
  if (loginStatusFloat) loginStatusFloat.hidden = !loggedIn;
  if (writerLoginBtn)   writerLoginBtn.hidden = loggedIn;
  if (floatAbout)       floatAbout.hidden = !loggedIn;
}

function logout() {
  localStorage.removeItem('decap-cms-user');
  applyAuthState();
  location.reload();
}

let loginPopup = null;
let loginPopupTimer = null;

function stopLoginPopupWatcher() {
  if (loginPopupTimer) {
    window.clearInterval(loginPopupTimer);
    loginPopupTimer = null;
  }
}

function openLoginModal() {
  document.getElementById('loginModal')?.classList.add('is-open');
}

function closeLoginModal() {
  document.getElementById('loginModal')?.classList.remove('is-open');
}

function openLoginPopup() {
  loginPopup = window.open(`${COUNTS_API_BASE}/auth`, 'github-oauth-login', 'width=600,height=700,resizable=yes,scrollbars=yes');
  stopLoginPopupWatcher();
  loginPopupTimer = window.setInterval(() => {
    if (!loginPopup || loginPopup.closed) {
      stopLoginPopupWatcher();
      loginPopup = null;
    }
  }, 500);
}

async function handleOAuthMessage(e) {
  if (typeof e.data !== 'string') return;

  if (e.data === 'authorizing:github') {
    e.source?.postMessage('authorizing:github', e.origin);
    return;
  }

  if (e.data.startsWith('authorization:github:success:')) {
    const payload = JSON.parse(e.data.replace('authorization:github:success:', ''));
    const token = payload.token;
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const user = await res.json();
      localStorage.setItem('decap-cms-user', JSON.stringify({
        token,
        provider: 'github',
        login: user.login || '',
        name: user.name || '',
      }));
    } catch {
      localStorage.setItem('decap-cms-user', JSON.stringify({ token, provider: 'github' }));
    }
    stopLoginPopupWatcher();
    try { if (loginPopup && !loginPopup.closed) loginPopup.close(); } catch {}
    loginPopup = null;
    closeLoginModal();
    applyAuthState();

    const toast = document.getElementById('loginToast');
    if (toast) {
      toast.hidden = false;
      setTimeout(() => { toast.hidden = true; }, 2000);
    }
  }
}

// ---- GitHub Contents API ----

async function ghFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }
  return res.json();
}

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

async function getFileSha(filePath) {
  try {
    const data = await ghFetch(`/repos/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`);
    return data.sha || null;
  } catch { return null; }
}

async function putTextFile(filePath, content, message, sha = null) {
  const body = { message, content: toBase64Utf8(content), branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  return ghFetch(`/repos/${GITHUB_REPO}/contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

async function putBinaryFile(filePath, base64, message, sha = null) {
  const body = { message, content: base64, branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;
  return ghFetch(`/repos/${GITHUB_REPO}/contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

async function deleteGhFile(filePath, message, sha) {
  return ghFetch(`/repos/${GITHUB_REPO}/contents/${filePath}`, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha, branch: GITHUB_BRANCH }),
  });
}

// ---- index.json ----

async function loadIndexJson() {
  const res = await fetch(`./content/posts/index.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function pushIndexJson(entries) {
  const sorted = [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  const sha = await getFileSha('content/posts/index.json');
  await putTextFile(
    'content/posts/index.json',
    JSON.stringify(sorted, null, 2) + '\n',
    'Update posts index',
    sha
  );
}

// ---- 画像アップロード ----

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadImage(file) {
  const b64  = await fileToBase64(file);
  const ext  = file.name.split('.').pop().toLowerCase();
  const slug = getJSTSlug();
  const filePath = `images/uploads/${slug}.${ext}`;
  const sha  = await getFileSha(filePath);
  await putBinaryFile(filePath, b64, `Upload image ${slug}.${ext}`, sha);
  return filePath;
}

// ---- 日時ヘルパー ----

function getJSTNowParts() {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  return Object.fromEntries(
    parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value])
  );
}

function getJSTSlug() {
  const p = getJSTNowParts();
  return `${p.year}-${p.month}-${p.day}-${p.hour}-${p.minute}-${p.second}`;
}

function getJSTDate() {
  const p = getJSTNowParts();
  return `${p.year}-${p.month}-${p.day}`;
}

function getJSTISO() {
  const p = getJSTNowParts();
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+09:00`;
}

// ---- モーダル DOM 参照 ----

const cmsModal         = document.getElementById('cmsModal');
const cmsFormScreen    = document.getElementById('cmsFormScreen');
const cmsDeleteScreen  = document.getElementById('cmsDeleteScreen');
const cmsModalTitle    = document.getElementById('cmsModalTitle');
const cmsAuthorBadge   = document.getElementById('cmsAuthorBadge');
const cmsAuthorName    = document.getElementById('cmsAuthorName');
const cmsModalClose    = document.getElementById('cmsModalClose');
const cmsTextarea      = document.getElementById('cmsTextarea');
const cmsImageInput    = document.getElementById('cmsImageInput');
const cmsImagePreview  = document.getElementById('cmsImagePreview');
const cmsImageClear    = document.getElementById('cmsImageClear');
const cmsImagePreviewWrap = document.querySelector('.cms-image-preview-wrap');
const cmsImageAddLabel = document.getElementById('cmsImageAddLabel');
const cmsImageReplaceLabel = document.getElementById('cmsImageReplaceLabel');
const cmsSaveBtn       = document.getElementById('cmsSaveBtn');
const cmsDeleteBtn     = document.getElementById('cmsDeleteBtn');
const cmsDeleteCancel  = document.getElementById('cmsDeleteCancelBtn');
const cmsDeleteConfirm = document.getElementById('cmsDeleteConfirmBtn');
const cmsStatus        = document.getElementById('cmsStatus');
const cmsLoader        = document.getElementById('cmsLoader');
const cmsField1Label   = document.getElementById('cmsField1Label');
const cmsField2Label   = document.getElementById('cmsField2Label');
const cmsTextarea2     = document.getElementById('cmsTextarea2');
const cmsExtraField    = document.getElementById('cmsExtraField');
const cmsImageSection  = document.getElementById('cmsImageSection');

// ---- モーダル状態 ----

let editEntry     = null;  // 編集中エントリ（null = 新規）
let editSha       = null;  // 編集ファイルの SHA
let keptImagePath = null;  // 保持する既存画像パス
let pageEditMode  = null;  // null | 'about' | 'writer'

// ---- UI ヘルパー ----

function setStatus(msg, isError = false) {
  if (!cmsStatus) return;
  cmsStatus.textContent = msg;
  cmsStatus.style.color = isError ? '#c00' : '#555';
}

function setLoading(on) {
  if (cmsLoader)    cmsLoader.classList.toggle('hidden', !on);
  if (cmsSaveBtn)   cmsSaveBtn.disabled   = on;
  if (cmsDeleteBtn) cmsDeleteBtn.disabled = on;
}

function setAuthorBadge(name = '') {
  if (cmsAuthorName) cmsAuthorName.textContent = name;
  if (cmsAuthorBadge) cmsAuthorBadge.hidden = !name;
}

function showFormScreen() {
  if (cmsFormScreen)   cmsFormScreen.hidden   = false;
  if (cmsDeleteScreen) cmsDeleteScreen.hidden = true;
}

function showDeleteScreen() {
  if (cmsFormScreen)   cmsFormScreen.hidden   = true;
  if (cmsDeleteScreen) cmsDeleteScreen.hidden = false;
}

function setImagePreview(src) {
  if (!cmsImagePreview) return;
  if (src) {
    cmsImagePreview.src    = src;
    cmsImagePreview.hidden = false;
    if (cmsImagePreviewWrap) cmsImagePreviewWrap.hidden = false;
    if (cmsImageAddLabel) cmsImageAddLabel.hidden = true;
    if (cmsImageReplaceLabel) cmsImageReplaceLabel.hidden = false;
    if (cmsImageClear) cmsImageClear.hidden = false;
  } else {
    cmsImagePreview.src    = '';
    cmsImagePreview.hidden = true;
    if (cmsImagePreviewWrap) cmsImagePreviewWrap.hidden = true;
    if (cmsImageAddLabel) cmsImageAddLabel.hidden = false;
    if (cmsImageReplaceLabel) cmsImageReplaceLabel.hidden = true;
    if (cmsImageClear) cmsImageClear.hidden = true;
  }
}

function normalizeSrc(img) {
  if (!img) return '';
  if (img.startsWith('http') || img.startsWith('/') || img.startsWith('./')) return img;
  return './' + img;
}

// ---- モーダル開閉 ----

// ---- モーダル共通リセット ----

function resetToPostMode() {
  pageEditMode = null;
  if (cmsExtraField)   cmsExtraField.hidden   = true;
  if (cmsImageSection) cmsImageSection.hidden = false;
  if (cmsField1Label)  cmsField1Label.hidden  = true;
}

export function openNewPostModal() {
  editEntry     = null;
  editSha       = null;
  keptImagePath = null;
  resetToPostMode();

  if (cmsModalTitle) cmsModalTitle.textContent = '新しい記録';
  setAuthorBadge(getAuthor());
  if (cmsTextarea)   cmsTextarea.value = localStorage.getItem('cms-draft') || '';
  if (cmsImageInput) cmsImageInput.value = '';
  if (cmsDeleteBtn)  cmsDeleteBtn.hidden = true;
  if (cmsSaveBtn)    cmsSaveBtn.textContent = '投稿する';
  setImagePreview('');
  setStatus('');
  setLoading(false);
  showFormScreen();
  cmsModal?.classList.add('is-open');
  cmsTextarea?.focus();
}

export function openEditModal(entry) {
  editEntry     = entry;
  editSha       = null;
  keptImagePath = entry.image || null;
  resetToPostMode();

  if (cmsModalTitle) cmsModalTitle.textContent = '記録を編集';
  setAuthorBadge(entry.author || getAuthor());
  if (cmsTextarea)   cmsTextarea.value = entry.text || '';
  if (cmsImageInput) cmsImageInput.value = '';
  if (cmsDeleteBtn)  cmsDeleteBtn.hidden = false;
  if (cmsSaveBtn)    cmsSaveBtn.textContent = '保存する';
  setImagePreview(keptImagePath ? normalizeSrc(keptImagePath) : '');
  setStatus('');
  setLoading(false);
  showFormScreen();
  cmsModal?.classList.add('is-open');
  cmsTextarea?.focus();

  getFileSha(`content/posts/${entry.id}.json`).then(sha => { editSha = sha; });
}

export async function openAboutEditModal() {
  pageEditMode  = 'about';
  editEntry     = null;
  editSha       = null;
  keptImagePath = null;

  if (cmsExtraField)   cmsExtraField.hidden   = true;
  if (cmsImageSection) cmsImageSection.hidden = true;
  if (cmsField1Label)  cmsField1Label.hidden  = true;
  if (cmsDeleteBtn)    cmsDeleteBtn.hidden     = true;
  if (cmsSaveBtn)      cmsSaveBtn.textContent  = '保存する';
  if (cmsModalTitle)   cmsModalTitle.textContent = 'Aboutの編集';
  setAuthorBadge('');

  setStatus('');
  setLoading(false);
  showFormScreen();

  try {
    const res = await fetch(`./content/pages/about.json?t=${Date.now()}`, { cache: 'no-store' });
    const d   = res.ok ? await res.json() : { body: '' };
    if (cmsTextarea) cmsTextarea.value = d.body || '';
  } catch {
    if (cmsTextarea) cmsTextarea.value = '';
  }

  cmsModal?.classList.add('is-open');
  cmsTextarea?.focus();
}

export async function openWriterEditModal() {
  pageEditMode  = 'writer';
  editEntry     = null;
  editSha       = null;
  keptImagePath = null;

  if (cmsImageSection) cmsImageSection.hidden = true;
  if (cmsDeleteBtn)    cmsDeleteBtn.hidden     = true;
  if (cmsSaveBtn)      cmsSaveBtn.textContent  = '保存する';
  if (cmsModalTitle)   cmsModalTitle.textContent = '書いてる人の編集';
  setAuthorBadge('');

  setStatus('');
  setLoading(false);
  showFormScreen();

  try {
    const res = await fetch(`./content/pages/writer.json?t=${Date.now()}`, { cache: 'no-store' });
    const d   = res.ok ? await res.json() : { writers: [{name:'わかこ',bio:''},{name:'まつけん',bio:''}] };
    const w   = d.writers || [];
    if (cmsField1Label)  { cmsField1Label.textContent  = w[0]?.name || 'わかこ';   cmsField1Label.hidden  = false; }
    if (cmsTextarea)       cmsTextarea.value  = w[0]?.bio  || '';
    if (cmsField2Label)    cmsField2Label.textContent  = w[1]?.name || 'まつけん';
    if (cmsTextarea2)      cmsTextarea2.value = w[1]?.bio  || '';
    if (cmsExtraField)     cmsExtraField.hidden = false;
  } catch {
    if (cmsTextarea)  cmsTextarea.value  = '';
    if (cmsTextarea2) cmsTextarea2.value = '';
    if (cmsExtraField) cmsExtraField.hidden = false;
  }

  cmsModal?.classList.add('is-open');
  cmsTextarea?.focus();
}

function closeCmsModal() {
  cmsModal?.classList.remove('is-open');
  editEntry     = null;
  editSha       = null;
  keptImagePath = null;
  pageEditMode  = null;
  setAuthorBadge('');
  resetToPostMode();
}

// ---- 保存処理 ----

async function handlePageSave() {
  setLoading(true);
  setStatus('保存中...');

  try {
    if (pageEditMode === 'about') {
      const body = cmsTextarea?.value?.trim() || '';
      const sha  = await getFileSha('content/pages/about.json');
      await putTextFile('content/pages/about.json', JSON.stringify({ body }, null, 2) + '\n', 'Update about page', sha);
      renderAboutBody(body);

    } else if (pageEditMode === 'writer') {
      const bio1 = cmsTextarea?.value?.trim()  || '';
      const bio2 = cmsTextarea2?.value?.trim() || '';
      const data = { writers: [
        { name: 'わかこ',   bio: bio1 },
        { name: 'まつけん', bio: bio2 },
      ]};
      const sha  = await getFileSha('content/pages/writer.json');
      await putTextFile('content/pages/writer.json', JSON.stringify(data, null, 2) + '\n', 'Update writer page', sha);
      renderWriterBody(data.writers);
    }

    setStatus('保存しました！');
    setTimeout(closeCmsModal, 900);
  } catch (err) {
    console.error('[cms] page save failed:', err);
    setStatus('エラー: ' + err.message, true);
    setLoading(false);
  }
}

async function handleSave() {
  if (pageEditMode) { await handlePageSave(); return; }

  const text      = cmsTextarea?.value?.trim() || '';
  const imageFile = cmsImageInput?.files?.[0] || null;

  if (!text && !imageFile && !keptImagePath) {
    setStatus('テキストか画像を入力してください', true);
    return;
  }

  setLoading(true);
  setStatus('準備中...');

  try {
    let imagePath = keptImagePath || null;
    if (imageFile) {
      setStatus('画像をアップロード中...');
      imagePath = await uploadImage(imageFile);
    }

    setStatus('記録を保存中...');
    const entries = await loadIndexJson();

    if (editEntry) {
      // ---- 編集 ----
      if (!editSha) {
        editSha = await getFileSha(`content/posts/${editEntry.id}.json`);
      }
      const postData = {
        author:    editEntry.author || getAuthor(),
        text,
        date:      editEntry.date,
        createdAt: editEntry.createdAt,
        viewCount: editEntry.viewCount || 0,
      };
      if (imagePath) postData.image = imagePath;

      await putTextFile(
        `content/posts/${editEntry.id}.json`,
        JSON.stringify(postData, null, 2) + '\n',
        `Update post ${editEntry.id}`,
        editSha
      );

      const idx = entries.findIndex(e => e.id === editEntry.id);
      if (idx !== -1) {
        const updated = { ...entries[idx], text };
        if (imagePath) updated.image = imagePath; else delete updated.image;
        entries[idx] = updated;
      }
    } else {
      // ---- 新規作成 ----
      const slug     = getJSTSlug();
      const postData = {
        author:    getAuthor(),
        text,
        date:      getJSTDate(),
        createdAt: getJSTISO(),
        viewCount: 0,
      };
      if (imagePath) postData.image = imagePath;

      await putTextFile(
        `content/posts/${slug}.json`,
        JSON.stringify(postData, null, 2) + '\n',
        `Create post ${slug}`
      );

      const newEntry = {
        id:        slug,
        date:      postData.date,
        author:    postData.author,
        text:      postData.text,
        caption:   '',
        createdAt: postData.createdAt,
        viewCount: 0,
      };
      if (imagePath) newEntry.image = imagePath;
      entries.push(newEntry);
    }

    setStatus('インデックスを更新中...');
    await pushIndexJson(entries);

    localStorage.removeItem('cms-draft');
    setStatus('保存しました！');
    setTimeout(() => { closeCmsModal(); location.reload(); }, 900);
  } catch (err) {
    console.error('[cms] save failed:', err);
    setStatus('エラー: ' + err.message, true);
    setLoading(false);
  }
}

// ---- 削除処理 ----

async function handleDeleteConfirm() {
  if (!editEntry) return;

  showFormScreen();
  setLoading(true);
  setStatus('削除中...');

  try {
    const sha = editSha || await getFileSha(`content/posts/${editEntry.id}.json`);
    if (!sha) throw new Error('ファイルのSHAを取得できませんでした');

    await deleteGhFile(
      `content/posts/${editEntry.id}.json`,
      `Delete post ${editEntry.id}`,
      sha
    );

    const entries = await loadIndexJson();
    await pushIndexJson(entries.filter(e => e.id !== editEntry.id));

    setStatus('削除しました');
    setTimeout(() => { closeCmsModal(); location.reload(); }, 900);
  } catch (err) {
    console.error('[cms] delete failed:', err);
    setStatus('エラー: ' + err.message, true);
    setLoading(false);
  }
}

// ---- イベントバインド ----

cmsModalClose?.addEventListener('click',  closeCmsModal);
cmsModal?.addEventListener('click', (e) => { if (e.target === cmsModal) closeCmsModal(); });

cmsSaveBtn?.addEventListener('click',       handleSave);
cmsTextarea?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
});
cmsDeleteBtn?.addEventListener('click',     showDeleteScreen);
cmsDeleteCancel?.addEventListener('click',  showFormScreen);
cmsDeleteConfirm?.addEventListener('click', handleDeleteConfirm);

cmsImageClear?.addEventListener('click', () => {
  keptImagePath = null;
  if (cmsImageInput) cmsImageInput.value = '';
  setImagePreview('');
});

cmsImageInput?.addEventListener('change', () => {
  const file = cmsImageInput.files?.[0];
  if (!file) return;
  keptImagePath = null;
  setImagePreview(URL.createObjectURL(file));
});

cmsTextarea?.addEventListener('input', () => {
  if (!editEntry && !pageEditMode) {
    const val = cmsTextarea.value;
    if (val.trim()) localStorage.setItem('cms-draft', val);
    else localStorage.removeItem('cms-draft');
  }
});

// エントリの編集ボタン（イベント委譲）
document.getElementById('entries')?.addEventListener('click', (e) => {
  const editBtn = e.target.closest('[data-edit-id]');
  if (!editBtn) return;
  e.preventDefault();
  const id    = editBtn.dataset.editId;
  const entry = state.allEntries.find(en => en.id === id);
  if (entry) openEditModal(entry);
});

// 新規投稿ボタン
document.getElementById('floatPost')?.addEventListener('click', openNewPostModal);

// 既読数リセットボタン
document.getElementById('resetSeenBtn')?.addEventListener('click', async () => {
  const ids = state.allEntries.map(e => e.id).filter(Boolean);
  if (ids.length) {
    try {
      const url = `${COUNTS_API_BASE}/.netlify/functions/counts-reset?ids=${encodeURIComponent(ids.join(','))}`;
      await fetch(url, { cache: 'no-store' });
    } catch (e) {
      console.error('[counts] reset failed:', e);
    }
  }
  localStorage.removeItem(SEEN_STORAGE_KEY);
  if (state.viewSeenIds) state.viewSeenIds.clear();
  location.reload();
});

// About・書いてる人 編集ボタン
document.getElementById('editAboutBtn')?.addEventListener('click',  openAboutEditModal);
document.getElementById('editWriterBtn')?.addEventListener('click', openWriterEditModal);

// ---- 初期化 ----

window.addEventListener('beforeunload', (e) => {
  if (cmsModal?.classList.contains('is-open') && cmsTextarea?.value.trim()) {
    e.preventDefault();
  }
});

export function initCms() {
  applyAuthState();
  const logoutPopup = document.getElementById('logoutPopup');
  const loginStatusFloat = document.getElementById('loginStatusFloat');
  loginStatusFloat?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (logoutPopup) logoutPopup.hidden = !logoutPopup.hidden;
  });
  document.getElementById('logoutPopupYes')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (logoutPopup) logoutPopup.hidden = true;
    logout();
  });
  document.addEventListener('click', (e) => {
    if (!logoutPopup?.hidden && !logoutPopup.contains(e.target)) {
      logoutPopup.hidden = true;
    }
  });
  document.getElementById('logoutConfirmYes')?.addEventListener('click', logout);
  document.getElementById('writerLoginBtn')?.addEventListener('click', openLoginModal);
  document.getElementById('loginModalClose')?.addEventListener('click', closeLoginModal);
  document.getElementById('loginModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('loginModal')) closeLoginModal();
  });
  document.getElementById('githubLoginBtn')?.addEventListener('click', openLoginPopup);
  window.addEventListener('message', handleOAuthMessage);
  window.addEventListener('storage', (e) => {
    if (e.key === 'decap-cms-user') applyAuthState();
  });
}
