/* ===== utils.js — ユーティリティ・時計更新 ===== */

import { DAY_JA } from './config.js';

export function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function pad(num) {
  return String(num).padStart(2, '0');
}

export function updateClock() {
  const clockDateEl = document.getElementById('clockDate');
  const clockTimeEl = document.getElementById('clockTime');
  const now = new Date();
  const dateStr = `${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())} (${DAY_JA[now.getDay()]})`;
  if (clockDateEl) clockDateEl.textContent = dateStr;
  if (clockTimeEl) clockTimeEl.innerHTML =
    `${pad(now.getHours())}<span class="clock-colon">:</span>${pad(now.getMinutes())}`;
}

export function normalizeImagePath(path) {
  if (!path) return '';
  if (path.startsWith('/images/')) return `.${path}`;
  return path;
}

export function formatOnlyTime(createdAt) {
  if (!createdAt) return '';
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '';
  let h = d.getHours();
  const label = h < 12 ? '午前' : '午後';
  h = h % 12;
  if (h === 0) h = 12;
  return `${label}${h}時`;
}

export function parseDateOnly(dateStr, createdAt) {
  if (dateStr) {
    const d = new Date(`${dateStr}T00:00:00+09:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }
  return null;
}

export function formatDateOnly(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} (${DAY_JA[date.getDay()]})`;
}

export function enumerateDayLabels(entries, { trailingDate = null } = {}) {
  const labels = new Map();
  if (!entries.length) return labels;

  const parsedDates = entries.map((entry) => parseDateOnly(entry.date, entry.createdAt));

  for (let i = 0; i < entries.length; i += 1) {
    const current = parsedDates[i];
    if (!current) continue;

    const prev = i > 0 ? parsedDates[i - 1] : null;
    const days = [];

    if (!prev) {
      days.push(formatDateOnly(current));
    } else {
      const prevStr = formatDateOnly(prev);
      const currentStr = formatDateOnly(current);

      if (prevStr !== currentStr) {
        const cursor = new Date(prev);
        cursor.setDate(cursor.getDate() + 1);

        while (cursor <= current) {
          days.push(formatDateOnly(cursor));
          cursor.setDate(cursor.getDate() + 1);
        }
      }
    }

    if (days.length) {
      labels.set(`before-${entries[i].id}`, days);
    }
  }

  // 最後のエントリ翌日〜trailingDate までの空白日
  if (trailingDate) {
    const lastDate = parsedDates[entries.length - 1];
    if (lastDate) {
      const cursor = new Date(lastDate);
      cursor.setDate(cursor.getDate() + 1);
      const trailing = [];
      while (cursor <= trailingDate) {
        trailing.push(formatDateOnly(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      if (trailing.length) {
        labels.set('after-last', trailing);
      }
    }
  }

  return labels;
}
