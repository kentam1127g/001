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
    if (!ids || !ids.length) return {};
    console.log('[counts] GET start — entries:', ids.length);
    const url = `${COUNTS_API_BASE}/.netlify/functions/counts-get?ids=${encodeURIComponent(ids.join(','))}`;
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    console.log('[counts] GET response status:', res.status, '— body:', text);
    if (!res.ok) {
      console.error(`[counts] GET failed: HTTP ${res.status}`, text);
      return {};
    }
    let data;
    try { data = JSON.parse(text); } catch { console.error('[counts] GET: JSON parse error', text); return {}; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      console.error('[counts] GET: unexpected format', data);
      return {};
    }
    return data;
  } catch (error) {
    console.error('[counts] GET failed (network?):', error);
    return {};
  }
}

export async function bumpSharedCounts(ids) {
  try {
    if (!ids.length) return {};
    console.log('[counts] BUMP start — ids:', ids);
    const url = `${COUNTS_API_BASE}/.netlify/functions/counts-bump?ids=${encodeURIComponent(ids.join(','))}`;
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    console.log('[counts] BUMP response status:', res.status, '— body:', text);
    if (!res.ok) {
      console.error(`[counts] BUMP failed: HTTP ${res.status}`, text);
      return {};
    }
    let data;
    try { data = JSON.parse(text); } catch { console.error('[counts] BUMP: JSON parse error', text); return {}; }
    if (!data?.counts || typeof data.counts !== 'object') {
      console.error('[counts] BUMP: unexpected format', data);
      return {};
    }
    console.log('[counts] BUMP ok:', data.counts);
    return data.counts;
  } catch (error) {
    console.error('[counts] BUMP failed (network?):', error);
    return {};
  }
}
