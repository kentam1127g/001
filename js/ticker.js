/* ===== ticker.js — ニュースフィード（Wikipedia 今日は何の日） ===== */

async function fetchOnThisDay() {
  const res = await fetch('https://ja.wikipedia.org/w/api.php?action=parse&format=json&page=Template:%E4%BB%8A%E6%97%A5%E3%81%AF%E4%BD%95%E3%81%AE%E6%97%A5&prop=text&origin=*');
  if (!res.ok) throw new Error('fetch error');
  const data = await res.json();
  const html = data?.parse?.text?.['*'];
  if (!html) throw new Error('no html');
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const items = [];
  tmp.querySelectorAll('li').forEach(li => {
    const t    = li.textContent.trim().replace(/\s+/g, ' ');
    const a    = li.querySelector('a[href]');
    const href = a ? 'https://ja.wikipedia.org' + a.getAttribute('href') : null;
    if (t) items.push({ t, href });
  });
  if (!items.length) throw new Error('no items');
  return items[Math.floor(Math.random() * items.length)];
}

(async () => {
  const track = document.getElementById('tickerTrack');
  const wrap  = track?.closest('.ticker-track-wrap');
  if (!track || !wrap) return;

  track.style.opacity = '0';
  const loader = document.createElement('div');
  loader.className = 'ticker-loading-text';
  loader.textContent = 'LOADING';
  wrap.appendChild(loader);

  const TICKER_LOADER_MS = 2500;
  const loaderStart = Date.now();

  let item = null;
  try { item = await fetchOnThisDay(); } catch { /* 取得失敗時は非表示のまま */ }

  const elapsed = Date.now() - loaderStart;
  if (elapsed < TICKER_LOADER_MS) {
    await new Promise(resolve => setTimeout(resolve, TICKER_LOADER_MS - elapsed));
  }

  loader.remove();
  if (!item) return;

  const label = `今日は何の日：「${item.t}」の日`;
  if (item.href) {
    const a = document.createElement('a');
    a.href = item.href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = label;
    track.replaceChildren(a);
  } else {
    track.textContent = label;
  }

  track.style.opacity = '';

  // テキスト幅を測定し、はみ出る場合のみスクロール開始
  requestAnimationFrame(() => {
    const containerWidth = wrap.clientWidth;
    const textWidth      = track.scrollWidth;
    const overflow       = textWidth - containerWidth;

    if (overflow > 0) {
      // はみ出た分だけスクロール（左端スタート → 右端到達でループ）
      track.style.setProperty('--ticker-dist', `-${overflow}px`);
      track.style.animationDuration = `${overflow / 20}s`; // 20px/s
      track.classList.add('is-scrolling');
    }
  });
})();
