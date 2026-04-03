/* ===== data.js — データ取得・ストレージ ===== */

import { CONTENT_INDEX_PATH, COUNTS_API_BASE, SEEN_STORAGE_KEY } from './config.js';

export function loadSeenEntries() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SEEN_STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSeenEntries(ids) {
  localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(ids));
}

function normalizeCountsResponse(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {
      counts: {},
      lastViewedAt: {},
      siteReaderName: '',
      siteReaderMsg: '',
      previousSiteReaderName: '',
      previousSiteReaderMsg: '',
    };
  }

  if (data.counts && typeof data.counts === 'object') {
    return {
      counts: data.counts,
      lastViewedAt: (data.lastViewedAt && typeof data.lastViewedAt === 'object' && !Array.isArray(data.lastViewedAt))
        ? data.lastViewedAt : {},
      siteReaderName: typeof data.siteReaderName === 'string' ? data.siteReaderName : '',
      siteReaderMsg: typeof data.siteReaderMsg === 'string' ? data.siteReaderMsg : '',
      previousSiteReaderName: typeof data.previousSiteReaderName === 'string' ? data.previousSiteReaderName : '',
      previousSiteReaderMsg: typeof data.previousSiteReaderMsg === 'string' ? data.previousSiteReaderMsg : '',
      previousSiteReaderUpdatedAt: data.previousSiteReaderUpdatedAt || null,
      siteReaderUpdatedAt: data.siteReaderUpdatedAt || null,
    };
  }

  return {
    counts: data,
    lastViewedAt: {},
    siteReaderName: '',
    siteReaderMsg: '',
    previousSiteReaderName: '',
    previousSiteReaderMsg: '',
    previousSiteReaderUpdatedAt: null,
  };
}

export async function loadEntriesFromContent() {
  const cacheBuster = `?t=${Date.now()}`;
  const res = await fetch(`${CONTENT_INDEX_PATH}${cacheBuster}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to fetch index.json: ${res.status}`);
  const text = await res.text();
  const data = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error('index.json is not an array');

  return [...data].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export async function loadSharedCounts(ids) {
  try {
    if (!ids || !ids.length) return { counts: {}, lastViewedAt: {}, siteReaderName: '', siteReaderMsg: '' };
    console.log('[counts] GET start — entries:', ids.length);
    const url = `${COUNTS_API_BASE}/.netlify/functions/counts-get?ids=${encodeURIComponent(ids.join(','))}`;
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    console.log('[counts] GET response status:', res.status, '— body:', text);
    if (!res.ok) {
      console.error(`[counts] GET failed: HTTP ${res.status}`, text);
      return { counts: {}, lastViewedAt: {}, siteReaderName: '', siteReaderMsg: '' };
    }
    let data;
    try { data = JSON.parse(text); } catch { console.error('[counts] GET: JSON parse error', text); return { counts: {}, lastViewedAt: {}, siteReaderName: '', siteReaderMsg: '' }; }
    return normalizeCountsResponse(data);
  } catch (error) {
    console.error('[counts] GET failed (network?):', error);
    return { counts: {}, lastViewedAt: {}, siteReaderName: '', siteReaderMsg: '' };
  }
}

export async function bumpSharedCounts(ids, readerInfo = {}) {
  try {
    if (!ids.length) return {
      counts: {},
      lastViewedAt: {},
      siteReaderName: '',
      siteReaderMsg: '',
      previousSiteReaderName: '',
      previousSiteReaderMsg: '',
    };
    console.log('[counts] BUMP start — ids:', ids);
    const nameParam = readerInfo.name ? `&readerName=${encodeURIComponent(readerInfo.name)}` : '';
    const msgParam  = readerInfo.msg  ? `&readerMsg=${encodeURIComponent(readerInfo.msg)}`   : '';
    const url = `${COUNTS_API_BASE}/.netlify/functions/counts-bump?ids=${encodeURIComponent(ids.join(','))}${nameParam}${msgParam}`;
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    console.log('[counts] BUMP response status:', res.status, '— body:', text);
    if (!res.ok) {
      console.error(`[counts] BUMP failed: HTTP ${res.status}`, text);
      return { counts: {}, lastViewedAt: {}, siteReaderName: '', siteReaderMsg: '', previousSiteReaderName: '', previousSiteReaderMsg: '' };
    }
    let data;
    try { data = JSON.parse(text); } catch { console.error('[counts] BUMP: JSON parse error', text); return { counts: {}, lastViewedAt: {}, siteReaderName: '', siteReaderMsg: '', previousSiteReaderName: '', previousSiteReaderMsg: '' }; }
    const normalized = normalizeCountsResponse(data);
    console.log('[counts] BUMP ok:', normalized.counts);
    return normalized;
  } catch (error) {
    console.error('[counts] BUMP failed (network?):', error);
    return { counts: {}, lastViewedAt: {}, siteReaderName: '', siteReaderMsg: '', previousSiteReaderName: '', previousSiteReaderMsg: '' };
  }
}

export async function syncLastReaderProfile(id, readerInfo = {}) {
  try {
    if (!id && !readerInfo.name && !readerInfo.msg) return { ok: true };
    const nameParam = readerInfo.name ? `&readerName=${encodeURIComponent(readerInfo.name)}` : '';
    const msgParam  = readerInfo.msg  ? `&readerMsg=${encodeURIComponent(readerInfo.msg)}`   : '';
    const url = `${COUNTS_API_BASE}/.netlify/functions/counts-profile-sync?noop=1${nameParam}${msgParam}`;
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    console.log('[counts] PROFILE response status:', res.status, '— body:', text);
    if (!res.ok) {
      console.error(`[counts] PROFILE failed: HTTP ${res.status}`, text);
      return { ok: false };
    }
    try {
      return JSON.parse(text);
    } catch {
      console.error('[counts] PROFILE: JSON parse error', text);
      return { ok: false };
    }
  } catch (error) {
    console.error('[counts] PROFILE failed (network?):', error);
    return { ok: false };
  }
}
