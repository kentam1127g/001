/* ===== ticker.js — ニュースフィード（Wikipedia 今日は何の日 & 東京都の天気予報） ===== */

async function fetchOnThisDay() {
  const res = await fetch(`https://ja.wikipedia.org/w/api.php?action=parse&format=json&page=Template:%E4%BB%8A%E6%97%A5%E3%81%AF%E4%BD%95%E3%81%AE%E6%97%A5&prop=text&origin=*&smaxage=0&maxage=0&_t=${Date.now()}`);
  if (!res.ok) throw new Error('wikipedia fetch error');
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
  const item = items[Math.floor(Math.random() * items.length)];
  return [{
    t: `今日は何の日：「${item.t}」の日`,
    href: item.href,
    icon: null
  }];
}

async function fetchWeather() {
  const res = await fetch('https://weather.tsukumijima.net/api/forecast/city/130010');
  if (!res.ok) throw new Error('weather fetch error');
  const data = await res.json();
  const forecasts = data.forecasts || [];
  if (!forecasts.length) throw new Error('no forecasts');
  
  return forecasts.slice(0, 2).map(f => {
    const dateLabel = f.dateLabel;
    const weatherDetail = (f.detail && f.detail.weather) ? f.detail.weather.replace(/\s+/g, ' ').trim() : f.telop;
    const temp = f.temperature.max.celsius ? ` 最高${f.temperature.max.celsius}℃` : '';
    return {
      t: `東京都の天気（${dateLabel}）：${weatherDetail}${temp}`,
      href: data.link,
      icon: f.image?.url
    };
  });
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

  let items = [];
  const useWeather = Math.random() < 0.5;
  try {
    items = useWeather ? await fetchWeather() : await fetchOnThisDay();
  } catch (err) {
    try {
      items = useWeather ? await fetchOnThisDay() : await fetchWeather();
    } catch (err2) {
      console.error('[ticker] fetch failed:', err2);
    }
  }

  const elapsed = Date.now() - loaderStart;
  if (elapsed < TICKER_LOADER_MS) {
    await new Promise(resolve => setTimeout(resolve, TICKER_LOADER_MS - elapsed));
  }

  loader.remove();
  if (!items.length) return;

  let currentIndex = 0;

  async function playNext() {
    const item = items[currentIndex];
    track.style.opacity = '0';
    track.classList.remove('is-scrolling');
    track.style.animation = 'none'; // アニメーションを解除
    track.style.transform = 'translateX(0)'; // 位置をリセット

    // フェードアウトの余韻
    await new Promise(r => setTimeout(r, 600));

    const itemEl = document.createElement(item.href ? 'a' : 'span');
    if (item.href) {
      itemEl.href = item.href;
      itemEl.target = '_blank';
      itemEl.rel = 'noopener noreferrer';
    }
    itemEl.className = 'ticker-content-item';
    itemEl.style.display = 'inline-flex';
    itemEl.style.alignItems = 'center';
    itemEl.style.gap = '6px';
    itemEl.style.color = 'inherit';
    itemEl.style.textDecoration = 'none';
    itemEl.style.whiteSpace = 'nowrap';
    itemEl.style.verticalAlign = 'top';
    itemEl.style.lineHeight = '24px';
    itemEl.style.paddingRight = '28px'; // 右端の見切れ防止パディング

    if (item.icon) {
      const img = document.createElement('img');
      img.src = item.icon;
      img.alt = '';
      img.style.height = '14px';
      img.style.width = 'auto';
      img.style.flexShrink = '0';
      img.style.display = 'block';
      img.style.transform = 'translateY(-2px)';
      itemEl.appendChild(img);
    }

    const textNode = document.createTextNode(item.t);
    itemEl.appendChild(textNode);
    
    track.replaceChildren(itemEl);
    track.style.opacity = '1';
    track.style.transform = 'translateX(0)';

    const PAUSE_START_MS = 2500;
    const PAUSE_END_MS   = 2500; // 終了時の静止時間を確保
    const SPEED_PX_SEC   = 35;
    let totalDisplayTime = 8000;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const containerWidth = wrap.clientWidth;
        const textWidth      = track.scrollWidth;
        // パディングを含めた全体の幅からはみ出した分を計算
        const overflow       = textWidth - containerWidth;

        if (overflow > 0) {
          const scrollTimeSec = overflow / SPEED_PX_SEC;
          const totalTimeSec  = (PAUSE_START_MS / 1000) + scrollTimeSec + (PAUSE_END_MS / 1000);
          
          totalDisplayTime = totalTimeSec * 1000;

          // CSS アニメーションの設定を直接更新（varパーセンテージが使えないため、個別に割り当てる）
          const startP = ((PAUSE_START_MS / 1000) / totalTimeSec * 100).toFixed(2);
          const endP   = (((PAUSE_START_MS / 1000) + scrollTimeSec) / totalTimeSec * 100).toFixed(2);

          track.style.setProperty('--ticker-dist', `-${overflow}px`);
          
          // CSSルールの再作成を避けるため、アニメーション名を切り替えて再適用
          const styleId = 'ticker-dynamic-keyframes';
          let styleEl = document.getElementById(styleId);
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
          }
          styleEl.innerHTML = `
            @keyframes ticker-scroll-dynamic {
              0%   { transform: translateX(0); }
              ${startP}% { transform: translateX(0); }
              ${endP}%   { transform: translateX(-${overflow}px); }
              100% { transform: translateX(-${overflow}px); }
            }
          `;
          
          track.style.animation = `ticker-scroll-dynamic ${totalTimeSec}s linear forwards`;
          track.classList.add('is-scrolling');
        } else {
          totalDisplayTime = 8000; 
          track.style.animation = 'none';
        }
      });
    });

    await new Promise(r => {
      const checkInterval = setInterval(() => {
        if (totalDisplayTime > 0) {
          clearInterval(checkInterval);
          setTimeout(r, totalDisplayTime);
        }
      }, 50);
    });

    currentIndex = (currentIndex + 1) % items.length;
    playNext();
  }

  playNext();
})();
