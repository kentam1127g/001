/* ===== ticker.js — ニュースフィード（Wikipedia / 気象庁） ===== */

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

async function fetchJMA() {
  const res = await fetch('https://www.data.jma.go.jp/developer/xml/feed/extra.xml');
  if (!res.ok) throw new Error('jma error');
  const xml     = new DOMParser().parseFromString(await res.text(), 'application/xml');
  const entries = Array.from(xml.querySelectorAll('entry'));
  if (!entries.length) throw new Error('no entries');
  const entry      = entries[Math.floor(Math.random() * entries.length)];
  const title      = entry.querySelector('title')?.textContent?.trim() || '';
  const content    = entry.querySelector('content, summary')?.textContent?.trim().replace(/\s+/g, ' ') || '';
  const updatedRaw = entry.querySelector('updated')?.textContent?.trim() || '';
  let dateStr = '';
  if (updatedRaw) {
    const d = new Date(updatedRaw);
    dateStr = ` ${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  const text = (content || title) + dateStr;
  return { text, link: 'https://www.jma.go.jp/jma/index.html' };
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

  const [otdItem, jmaItem] = await Promise.allSettled([fetchOnThisDay(), fetchJMA()]);

  const elapsed = Date.now() - loaderStart;
  if (elapsed < TICKER_LOADER_MS) {
    await new Promise(resolve => setTimeout(resolve, TICKER_LOADER_MS - elapsed));
  }

  const nodes = [];

  if (otdItem.status === 'fulfilled' && otdItem.value) {
    const item  = otdItem.value;
    const label = `今日は何の日「${item.t}」の日`;
    if (item.href) {
      const a = document.createElement('a');
      a.href = item.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = label;
      nodes.push(a);
    } else {
      nodes.push(document.createTextNode(label));
    }
  }

  if (jmaItem.status === 'fulfilled' && jmaItem.value) {
    const item  = jmaItem.value;
    const label = `気象庁防災情報${item.text}`;
    if (nodes.length) nodes.push(document.createTextNode('　　　'));
    if (item.link) {
      const a = document.createElement('a');
      a.href = item.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = label;
      nodes.push(a);
    } else {
      nodes.push(document.createTextNode(label));
    }
  }

  loader.remove();

  if (!nodes.length) return;
  track.replaceChildren(...nodes);
  track.style.opacity = '';

  // テキスト描画後に実ピクセル幅を取得して一定速度（60px/s）で duration を計算
  requestAnimationFrame(() => {
    const totalPx = window.innerWidth + track.scrollWidth;
    const duration = totalPx / 60;
    track.style.animationDuration = `${duration}s`;
    track.style.animationPlayState = 'running';
  });
})();
