/* ===== cms.js — CMS認証・投稿管理モーダル ===== */

import { state } from './state.js';

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
  document.body.classList.toggle('is-admin', isLoggedIn());
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
const cmsModalClose    = document.getElementById('cmsModalClose');
const cmsTextarea      = document.getElementById('cmsTextarea');
const cmsImageInput    = document.getElementById('cmsImageInput');
const cmsImagePreview  = document.getElementById('cmsImagePreview');
const cmsImageClear    = document.getElementById('cmsImageClear');
const cmsSaveBtn       = document.getElementById('cmsSaveBtn');
const cmsDeleteBtn     = document.getElementById('cmsDeleteBtn');
const cmsDeleteCancel  = document.getElementById('cmsDeleteCancelBtn');
const cmsDeleteConfirm = document.getElementById('cmsDeleteConfirmBtn');
const cmsStatus        = document.getElementById('cmsStatus');
const cmsLoader        = document.getElementById('cmsLoader');

// ---- モーダル状態 ----

let editEntry     = null;  // 編集中エントリ（null = 新規）
let editSha       = null;  // 編集ファイルの SHA
let keptImagePath = null;  // 保持する既存画像パス

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
    if (cmsImageClear) cmsImageClear.hidden = false;
  } else {
    cmsImagePreview.src    = '';
    cmsImagePreview.hidden = true;
    if (cmsImageClear) cmsImageClear.hidden = true;
  }
}

function normalizeSrc(img) {
  if (!img) return '';
  if (img.startsWith('http') || img.startsWith('/') || img.startsWith('./')) return img;
  return './' + img;
}

// ---- モーダル開閉 ----

export function openNewPostModal() {
  editEntry     = null;
  editSha       = null;
  keptImagePath = null;

  if (cmsModalTitle) cmsModalTitle.textContent = '新しい記録';
  if (cmsTextarea)   cmsTextarea.value = '';
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

  if (cmsModalTitle) cmsModalTitle.textContent = '記録を編集';
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

  // SHA を非同期で取得
  getFileSha(`content/posts/${entry.id}.json`).then(sha => { editSha = sha; });
}

function closeCmsModal() {
  cmsModal?.classList.remove('is-open');
  editEntry     = null;
  editSha       = null;
  keptImagePath = null;
}

// ---- 保存処理 ----

async function handleSave() {
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

// ---- 初期化 ----

export function initCms() {
  applyAuthState();
  window.addEventListener('storage', (e) => {
    if (e.key === 'decap-cms-user') applyAuthState();
  });
}
