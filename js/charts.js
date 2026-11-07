// stats.html의 그래프. 외부 라이브러리 없이 SVG로 그린다.
// 값을 고쳐 다시 그릴 때는 같은 함수를 다시 부르면 되고, 창 크기가 바뀌면 마지막 그림을 다시 그린다.

const M = { top: 20, right: 8, bottom: 24, left: 34 };
const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');

// ---------- 공용 말풍선 (값은 textContent로만 넣는다) ----------
let tip = null;

function showTip(e, title, rows) {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    document.body.appendChild(tip);
  }
  tip.replaceChildren();
  const head = document.createElement('p');
  head.textContent = title;
  tip.appendChild(head);
  for (const r of rows) {
    const row = document.createElement('div');
    if (r.color) {
      const key = document.createElement('i');
      key.style.background = r.color;
      row.appendChild(key);
    }
    const value = document.createElement('b');
    value.textContent = r.value;
    row.appendChild(value);
    if (r.label) row.appendChild(document.createTextNode(r.label));
    tip.appendChild(row);
  }
  tip.hidden = false;
  const box = tip.getBoundingClientRect();
  const x = e.clientX ?? e.target.getBoundingClientRect().left;
  const y = e.clientY ?? e.target.getBoundingClientRect().top;
  tip.style.left = `${Math.max(8, Math.min(innerWidth - box.width - 8, x + 12))}px`;
  tip.style.top = `${Math.max(8, y - box.height - 10)}px`;
}

function hideTip() {
  if (tip) tip.hidden = true;
}

// ---------- 축 ----------
function scale(max) {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const rough = max / 3;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((k) => k * mag).find((s) => s >= rough));
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

function frame(el, height, labels, max) {
  const w = Math.max(240, el.clientWidth);
  const plotW = w - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const band = plotW / labels.length;
  const { top, ticks } = scale(max);
  const y = (v) => M.top + plotH - (v / top) * plotH;
  const every = Math.ceil(36 / band); // 글자가 겹치지 않게 건너뛰며 표시
  const grid = ticks.map((t) => `
    <line class="grid" x1="${M.left}" x2="${w - M.right}" y1="${y(t)}" y2="${y(t)}"/>
    <text class="axis" x="${M.left - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join('');
  const xs = labels.map((l, i) => (((labels.length - 1 - i) % every === 0)
    ? `<text class="axis" x="${M.left + band * (i + 0.5)}" y="${height - 6}" text-anchor="middle">${l}</text>` : '')).join('');
  return { w, plotH, band, y, base: y(0), axes: grid + xs };
}

function hits(band, height, count) {
  let out = '';
  for (let i = 0; i < count; i++) {
    out += `<rect class="hit" data-i="${i}" x="${M.left + band * i}" y="0" width="${band}" height="${height}" tabindex="0"/>`;
  }
  return out;
}

function bindHits(el, onHover, onLeave = () => {}) {
  for (const h of el.querySelectorAll('.hit')) {
    const show = (e) => onHover(Number(h.dataset.i), e);
    h.addEventListener('pointerenter', show);
    h.addEventListener('pointermove', show);
    h.addEventListener('focus', show);
    for (const type of ['pointerleave', 'blur']) {
      h.addEventListener(type, () => {
        hideTip();
        onLeave();
      });
    }
  }
}

// ---------- 막대 하나짜리 시계열 ----------
// items: [{ label, title, value }]
function drawColumns(el, items, { height = 180, unit = '' }) {
  const max = Math.max(0, ...items.map((d) => d.value));
  const f = frame(el, height, items.map((d) => d.label), max);
  const bw = Math.min(24, Math.max(2, f.band - 2));
  const peak = items.findIndex((d) => d.value === max && max > 0);
  const bars = items.map((d, i) => {
    if (!d.value) return '';
    const x = M.left + f.band * i + (f.band - bw) / 2;
    const t = f.y(d.value);
    const r = Math.min(4, bw / 2, f.base - t);
    const path = `M${x} ${f.base}V${t + r}Q${x} ${t} ${x + r} ${t}H${x + bw - r}Q${x + bw} ${t} ${x + bw} ${t + r}V${f.base}Z`;
    const label = i === peak ? `<text class="peak" x="${x + bw / 2}" y="${t - 6}" text-anchor="middle">${fmt(d.value)}</text>` : '';
    return `<path class="bar" d="${path}"/>${label}`;
  }).join('');
  el.innerHTML = `<svg width="${f.w}" height="${height}" role="img">${f.axes}${bars}${hits(f.band, height, items.length)}</svg>`;
  bindHits(el, (i, e) => showTip(e, items[i].title || items[i].label, [{ value: `${fmt(items[i].value)}${unit}` }]));
}

// ---------- 선 여러 개 (같은 단위일 때만) ----------
// labels: x축 이름, series: [{ name, color, values }]
function drawLines(el, labels, series, { height = 220, unit = '' }) {
  const legend = `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>`;
  el.innerHTML = `${legend}<div class="plot"></div>`;
  const plot = el.querySelector('.plot');
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const f = frame(plot, height, labels, max);
  const px = (i) => M.left + f.band * (i + 0.5);
  const lines = series.map((s) => {
    const pts = s.values.map((v, i) => `${px(i)},${f.y(v)}`).join(' ');
    const last = s.values.length - 1;
    return `<polyline class="line" points="${pts}" style="stroke:${s.color}"/>
      <circle class="dot" cx="${px(last)}" cy="${f.y(s.values[last])}" r="4" style="fill:${s.color}"/>`;
  }).join('');
  plot.innerHTML = `<svg width="${f.w}" height="${height}" role="img">${f.axes}
    <line class="cross" y1="${M.top}" y2="${f.base}" hidden/>${lines}${hits(f.band, height, labels.length)}</svg>`;
  const cross = plot.querySelector('.cross');
  bindHits(plot, (i, e) => {
    cross.setAttribute('x1', px(i));
    cross.setAttribute('x2', px(i));
    cross.removeAttribute('hidden');
    showTip(e, labels[i], series.map((s) => ({ color: s.color, value: `${fmt(s.values[i])}${unit}`, label: s.name })));
  }, () => cross.setAttribute('hidden', ''));
}

// ---------- 전체 중 비율 ----------
// parts: [{ label, value, color }]
function drawStack(el, parts) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const pct = (v) => (total ? Math.round((v / total) * 100) : 0);
  el.innerHTML = `<div class="stack">${parts.filter((p) => p.value).map((p) => `
      <div class="seg" style="flex:${p.value};background:${p.color}" title="${p.label} ${fmt(p.value)}"></div>`).join('')}</div>
    <div class="legend">${parts.map((p) => `<span><i style="background:${p.color}"></i>${p.label} <b>${fmt(p.value)}</b> ${pct(p.value)}%</span>`).join('')}</div>`;
}

// ---------- 창 크기가 바뀌면 다시 그리기 ----------
const drawn = new Map();

function remember(el, draw) {
  drawn.set(el, draw);
  draw();
}

let resizeTimer = 0;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => drawn.forEach((draw) => draw()), 150);
});

export const columns = (el, items, opts = {}) => remember(el, () => drawColumns(el, items, opts));
export const lines = (el, labels, series, opts = {}) => remember(el, () => drawLines(el, labels, series, opts));
export const stack = (el, parts) => drawStack(el, parts);
