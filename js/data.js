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
    return { counts: {}, lastViewedAt: {} };
  }

  if (data.counts && typeof data.counts === 'object') {
    return {
      counts: data.counts,
      lastViewedAt: (data.lastViewedAt && typeof data.lastViewedAt === 'object' && !Array.isArray(data.lastViewedAt))
        ? data.lastViewedAt
        : {},
    };
  }

  return { counts: data, lastViewedAt: {} };
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
    if (!ids || !ids.length) return { counts: {}, lastViewedAt: {} };
    console.log('[counts] GET start — entries:', ids.length);
    const url = `${COUNTS_API_BASE}/.netlify/functions/counts-get?ids=${encodeURIComponent(ids.join(','))}`;
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    console.log('[counts] GET response status:', res.status, '— body:', text);
    if (!res.ok) {
      console.error(`[counts] GET failed: HTTP ${res.status}`, text);
      return { counts: {}, lastViewedAt: {} };
    }
    let data;
    try { data = JSON.parse(text); } catch { console.error('[counts] GET: JSON parse error', text); return { counts: {}, lastViewedAt: {} }; }
    return normalizeCountsResponse(data);
  } catch (error) {
    console.error('[counts] GET failed (network?):', error);
    return { counts: {}, lastViewedAt: {} };
  }
}

export async function bumpSharedCounts(ids) {
  try {
    if (!ids.length) return { counts: {}, lastViewedAt: {} };
    console.log('[counts] BUMP start — ids:', ids);
    const url = `${COUNTS_API_BASE}/.netlify/functions/counts-bump?ids=${encodeURIComponent(ids.join(','))}`;
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    console.log('[counts] BUMP response status:', res.status, '— body:', text);
    if (!res.ok) {
      console.error(`[counts] BUMP failed: HTTP ${res.status}`, text);
      return { counts: {}, lastViewedAt: {} };
    }
    let data;
    try { data = JSON.parse(text); } catch { console.error('[counts] BUMP: JSON parse error', text); return { counts: {}, lastViewedAt: {} }; }
    const normalized = normalizeCountsResponse(data);
    console.log('[counts] BUMP ok:', normalized.counts);
    return normalized;
  } catch (error) {
    console.error('[counts] BUMP failed (network?):', error);
    return { counts: {}, lastViewedAt: {} };
  }
}
