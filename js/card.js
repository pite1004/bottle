// 공유 카드: 1080×1920 canvas — 하늘·바다, 잠긴 도시, 병, 글귀, 서비스 이름.
import { bottleSVG, seaBottleSVG } from './bottle.js';

const W = 1080;
const H = 1920;
const HORIZON = 0.34 * H;

const PALETTE = {
  day: { sky: ['#dfe7ef', '#eef2f6'], sea: ['#d3dde6', '#b4c4d3'], city: '#b9c5d0', ink: '#1f2328', sub: '#4f5763' },
  dusk: { sky: ['#a7a2bd', '#f1c9a8'], sea: ['#d6b9b0', '#a89caa'], city: '#8e7f92', ink: '#1f2328', sub: '#3b4250' },
  night: { sky: ['#1b1f26', '#262b33'], sea: ['#36404c', '#272f38'], city: '#1d2229', ink: '#d6dbe1', sub: '#aab2bc' },
};

const FONT = {
  pen: { family: 'Nanum Pen Script', size: 96, line: 1.3 },
  round: { family: 'Gaegu', size: 74, line: 1.45 },
  mono: { family: 'Nanum Gothic Coding', size: 56, line: 1.6 },
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// 단어 단위로 줄바꿈하고, 한 단어가 너무 길면 글자 단위로 자른다.
function wrap(ctx, text, maxWidth) {
  const lines = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const next = line + word;
      if (ctx.measureText(next).width <= maxWidth) {
        line = next;
        continue;
      }
      if (line.trim()) lines.push(line.trim());
      line = '';
      for (const ch of word.trimStart()) {
        if (ctx.measureText(line + ch).width > maxWidth) {
          lines.push(line);
          line = ch;
        } else {
          line += ch;
        }
      }
    }
    if (line.trim()) lines.push(line.trim());
  }
  return lines;
}

// 정해진 높이 안에 들어가는 가장 큰 글자 크기와 줄. 그래도 넘치면 끝을 …로 줄인다.
// pad: 글귀 칸의 위아래 여백 합
function fitText(ctx, text, f, maxWidth, maxHeight, pad) {
  let fit = null;
  for (let k = 1; k >= 0.5; k -= 0.05) {
    const size = Math.round(f.size * k);
    ctx.font = `${size}px "${f.family}"`;
    const lines = wrap(ctx, text, maxWidth);
    const lineH = size * f.line;
    fit = { size, lines, lineH, boxH: lines.length * lineH + pad };
    if (fit.boxH <= maxHeight) return fit;
  }
  const keep = Math.max(1, Math.floor((maxHeight - pad) / fit.lineH));
  if (fit.lines.length > keep) {
    fit.lines = fit.lines.slice(0, keep);
    fit.lines[keep - 1] = `${fit.lines[keep - 1].replace(/.$/u, '')}…`;
  }
  fit.boxH = fit.lines.length * fit.lineH + pad;
  return fit;
}

function drawCity(ctx, color) {
  ctx.fillStyle = color;
  let s = 2100;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  let x = 0;
  while (x < W) {
    const w = 30 + rnd() * 70;
    const h = 20 + rnd() * 80;
    if (rnd() > 0.18) {
      ctx.fillRect(x, HORIZON - h, w, h);
      if (rnd() > 0.6) ctx.fillRect(x + w / 2 - 2, HORIZON - h - 22, 4, 22);
    }
    x += w + rnd() * 18;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// bottle: { text, font, shape, color, cork, inside }, time: 'day' | 'dusk' | 'night'
export async function renderCard(bottle, time = 'day') {
  const pal = PALETTE[time] || PALETTE.day;
  const f = FONT[bottle.font] || FONT.pen;
  const fontCss = `${f.size}px "${f.family}"`;
  await Promise.all([
    document.fonts.load(fontCss, bottle.text),
    document.fonts.load('700 34px "Noto Sans KR"', '유리병 편지'),
  ]).catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 하늘·바다
  let g = ctx.createLinearGradient(0, 0, 0, HORIZON);
  g.addColorStop(0, pal.sky[0]);
  g.addColorStop(1, pal.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HORIZON);
  g = ctx.createLinearGradient(0, HORIZON, 0, H);
  g.addColorStop(0, pal.sea[0]);
  g.addColorStop(1, pal.sea[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, HORIZON, W, H - HORIZON);
  drawCity(ctx, pal.city);
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.fillRect(0, HORIZON, W, 3);

  // 글귀가 길면 글자와 병을 줄여서 아래 서비스 이름과 겹치지 않게 한다
  const top = HORIZON + 50;
  const bottomLimit = H - 170;
  const { size, lines, lineH, boxH } = fitText(ctx, bottle.text, f, 800, bottomLimit - top - 320 - 40, 120);
  const bottleH = Math.min(600, bottomLimit - top - boxH - 40);

  // 병
  const svg = (bottle.special ? seaBottleSVG() : bottleSVG(bottle)).replace('<svg ', '<svg width="300" height="600" ');
  const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  ctx.drawImage(img, (W - bottleH / 2) / 2, top, bottleH / 2, bottleH);

  // 글귀 (종이 카드 위에)
  ctx.font = `${size}px "${f.family}"`;
  const boxY = top + bottleH + 40;
  ctx.fillStyle = 'rgba(251,247,236,.94)';
  roundRect(ctx, 80, boxY, W - 160, boxH, 40);
  ctx.fill();
  ctx.fillStyle = '#2a2620';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, boxY + 60 + lineH * (i + 0.5));
  });

  // 서비스 이름
  ctx.fillStyle = pal.ink;
  ctx.font = '700 34px "Noto Sans KR"';
  ctx.fillText('유리병 편지', W / 2, H - 120);
  ctx.fillStyle = pal.sub;
  ctx.font = '28px "Noto Sans KR"';
  ctx.fillText('2100년 · 잠긴 바다', W / 2, H - 74);
  ctx.font = '26px "Noto Sans KR"';
  ctx.fillText(location.host, W / 2, H - 34);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// 나의 바다 기록 카드: stats [{ label, value }], quote(별표 친 편지, 없으면 null). 이름·아이디는 넣지 않는다.
export async function renderRecordCard(stats, quote, time = 'day') {
  const pal = PALETTE[time] || PALETTE.day;
  const qf = quote ? FONT[quote.font] || FONT.pen : null;
  await Promise.all([
    document.fonts.load('700 64px "Noto Sans KR"', '나의 바다 기록'),
    document.fonts.load('32px "Noto Sans KR"', '건진 편지'),
    qf ? document.fonts.load(`${qf.size * 0.8}px "${qf.family}"`, quote.text) : null,
  ]).catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  let g = ctx.createLinearGradient(0, 0, 0, HORIZON);
  g.addColorStop(0, pal.sky[0]);
  g.addColorStop(1, pal.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HORIZON);
  g = ctx.createLinearGradient(0, HORIZON, 0, H);
  g.addColorStop(0, pal.sea[0]);
  g.addColorStop(1, pal.sea[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, HORIZON, W, H - HORIZON);
  drawCity(ctx, pal.city);

  // 제목
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  ctx.font = '700 64px "Noto Sans KR"';
  ctx.fillText('나의 바다 기록', W / 2, 260);
  ctx.fillStyle = pal.sub;
  ctx.font = '30px "Noto Sans KR"';
  ctx.fillText('2100년 · 잠긴 바다에서', W / 2, 340);

  // 2열 기록 칸 (수평선을 걸쳐 놓아서 아래에 인용 칸 자리를 넉넉히 남긴다)
  const top = 440;
  const boxW = (W - 160 - 30) / 2;
  const boxH = 190;
  stats.forEach((s, i) => {
    const x = 80 + (i % 2) * (boxW + 30);
    const y = top + Math.floor(i / 2) * (boxH + 30);
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    roundRect(ctx, x, y, boxW, boxH, 32);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#5b6370';
    ctx.font = '30px "Noto Sans KR"';
    ctx.fillText(s.label, x + 36, y + 58);
    ctx.fillStyle = '#1d4a6b';
    ctx.font = '700 60px "Noto Sans KR"';
    ctx.fillText(s.value, x + 36, y + 128);
  });

  // 마음에 남은 편지
  if (quote) {
    const y0 = top + Math.ceil(stats.length / 2) * (boxH + 30) + 10;
    const { size, lines, lineH, boxH: h } = fitText(ctx, quote.text, { ...qf, size: qf.size * 0.8 }, 780, H - 170 - y0, 130);
    ctx.fillStyle = 'rgba(251,247,236,.94)';
    roundRect(ctx, 80, y0, W - 160, h, 32);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6b5a40';
    ctx.font = '28px "Noto Sans KR"';
    ctx.fillText('마음에 남은 편지', 120, y0 + 52);
    ctx.fillStyle = '#2a2620';
    ctx.font = `${size}px "${qf.family}"`;
    ctx.textAlign = 'center';
    lines.forEach((line, i) => ctx.fillText(line, W / 2, y0 + 100 + lineH * (i + 0.5)));
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = pal.ink;
  ctx.font = '700 34px "Noto Sans KR"';
  ctx.fillText('유리병 편지', W / 2, H - 120);
  ctx.fillStyle = pal.sub;
  ctx.font = '28px "Noto Sans KR"';
  ctx.fillText('2100년 · 잠긴 바다', W / 2, H - 74);
  ctx.font = '26px "Noto Sans KR"';
  ctx.fillText(location.host, W / 2, H - 34);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

// 내 병의 여정 카드. j: computeJourney() 결과, svg: 병 그림. 이름·uid 등 식별 정보는 넣지 않는다.
export async function renderJourneyCard(j, hideText, time = 'day', svg) {
  const pal = PALETTE[time] || PALETTE.day;
  const f = FONT[j.font] || FONT.pen;
  const textSize = Math.round(f.size * 0.75);
  await Promise.all([
    document.fonts.load('700 88px "Noto Sans KR"', '0123456789명에게 닿았어요 내 병을 건져줄 사람?'),
    hideText ? null : document.fonts.load(`${textSize}px "${f.family}"`, j.text),
  ]).catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  let g = ctx.createLinearGradient(0, 0, 0, HORIZON);
  g.addColorStop(0, pal.sky[0]);
  g.addColorStop(1, pal.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, HORIZON);
  g = ctx.createLinearGradient(0, HORIZON, 0, H);
  g.addColorStop(0, pal.sea[0]);
  g.addColorStop(1, pal.sea[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, HORIZON, W, H - HORIZON);
  drawCity(ctx, pal.city);

  // 제목: 0명이면 초대용 문구
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = pal.ink;
  if (j.reached > 0) {
    ctx.font = '500 42px "Noto Sans KR"';
    ctx.fillText('내 병이 바다를 건너', W / 2, 210);
    ctx.font = '700 88px "Noto Sans KR"';
    ctx.fillText(`${j.reached}명에게 닿았어요`, W / 2, 310);
  } else {
    ctx.font = '700 80px "Noto Sans KR"';
    ctx.fillText('내 병을 건져줄 사람?', W / 2, 240);
    ctx.fillStyle = pal.sub;
    ctx.font = '34px "Noto Sans KR"';
    ctx.fillText('아직 바다를 건너는 중이에요', W / 2, 320);
  }

  // 병
  const img = await loadImage('data:image/svg+xml;charset=utf-8,'
    + encodeURIComponent(svg.replace('<svg ', '<svg width="220" height="440" ')));
  ctx.drawImage(img, (W - 220) / 2, 420, 220, 440);

  let y = 900;
  // 글귀 (가리기 상태면 넣지 않음)
  if (!hideText) {
    const timeline = 170 + (j.recorded ? 190 : 0) + 50;
    const { size, lines, lineH, boxH: h } = fitText(ctx, j.text, { ...f, size: textSize }, 780, H - 170 - y - timeline, 80);
    ctx.font = `${size}px "${f.family}"`;
    ctx.fillStyle = 'rgba(251,247,236,.94)';
    roundRect(ctx, 100, y, W - 200, h, 32);
    ctx.fill();
    ctx.fillStyle = '#2a2620';
    lines.forEach((line, i) => ctx.fillText(line, W / 2, y + 40 + lineH * (i + 0.5)));
    y += h + 50;
  } else {
    y += 20;
  }

  // 타임라인 축소판
  const x0 = 150, x1 = W - 150;
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  roundRect(ctx, 100, y, W - 200, 170 + (j.recorded ? 190 : 0), 32);
  ctx.fill();
  const ty = y + 70;
  ctx.strokeStyle = '#2f6f9f';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, ty);
  ctx.lineTo(x1, ty);
  ctx.stroke();
  const maxN = Math.max(1, ...j.points.map((p) => p.n));
  for (const p of j.points) {
    const r = j.grouped ? 10 + (p.n / maxN) * 14 : 13;
    ctx.beginPath();
    ctx.arc(x0 + (x1 - x0) * p.pos, ty, r, 0, Math.PI * 2);
    ctx.fillStyle = '#e3b23c';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }
  ctx.fillStyle = '#5b6370';
  ctx.font = '28px "Noto Sans KR"';
  ctx.textAlign = 'left';
  const d = new Date(j.createdAt);
  ctx.fillText(`${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')} 띄움`, x0 - 10, ty + 60);
  ctx.textAlign = 'right';
  ctx.fillText(`지금 · ${j.days}일째`, x1 + 10, ty + 60);

  // 낮 · 노을 · 밤 비율
  if (j.recorded) {
    const total = j.counts.day + j.counts.sunset + j.counts.night;
    const rows = [['낮', j.counts.day, '#e3b23c'], ['노을', j.counts.sunset, '#d9826a'], ['밤', j.counts.night, '#3d5f8c']];
    rows.forEach(([label, n, color], i) => {
      const ry = ty + 140 + i * 56;
      const pctv = total ? n / total : 0;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1f2328';
      ctx.font = '30px "Noto Sans KR"';
      ctx.fillText(label, x0, ry);
      ctx.fillStyle = '#e3e8ee';
      roundRect(ctx, x0 + 100, ry - 12, x1 - x0 - 220, 24, 12);
      ctx.fill();
      if (pctv > 0) {
        ctx.fillStyle = color;
        roundRect(ctx, x0 + 100, ry - 12, Math.max(24, (x1 - x0 - 220) * pctv), 24, 12);
        ctx.fill();
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = '#5b6370';
      ctx.fillText(`${Math.round(pctv * 100)}%`, x1, ry);
    });
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = pal.ink;
  ctx.font = '700 34px "Noto Sans KR"';
  ctx.fillText('유리병 편지', W / 2, H - 120);
  ctx.fillStyle = pal.sub;
  ctx.font = '28px "Noto Sans KR"';
  ctx.fillText('2100년 · 잠긴 바다', W / 2, H - 74);
  ctx.font = '26px "Noto Sans KR"';
  ctx.fillText(location.host, W / 2, H - 34);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// 웹페이지는 갤러리에 직접 저장할 수 없다.
// 안드로이드: 다운로드하면 Download 폴더에 저장되고, 갤러리 앱의 Download 앨범에 나타난다.
// 아이폰: 다운로드가 '파일' 앱으로 가서, 공유 시트의 "이미지 저장"(사진 앱)을 쓴다.
// how: 'share'(공유 시트 우선) | 'save'(저장 우선)
// url: 공유할 때 같이 보내는 링크 (?ref=…&b=… 로 유입 경로를 센다)
// 돌려주는 값: 'shared' | 'saved'(다운로드) | 'saved-sheet'(아이폰 공유 시트로 저장) | 'cancelled'
export async function shareOrSave(blob, how, url) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/\D/g, '');
  const name = `bottle-letter-${stamp}.png`; // 저장할 때마다 이름이 달라 덮어쓰지 않게
  const file = new File([blob], name, { type: 'image/png' });
  const canShare = navigator.canShare && navigator.canShare({ files: [file] });
  if (canShare && (how === 'share' || isIOS)) {
    try {
      // 저장 목적일 땐 링크를 빼야 시트에 "이미지 저장"이 잘 나온다
      const data = how === 'share' && url
        ? { files: [file], title: '유리병 편지', text: `유리병 편지 ${url}`, url }
        : { files: [file], title: '유리병 편지' };
      await navigator.share(data);
      return how === 'share' ? 'shared' : 'saved-sheet';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // 공유가 막히면 다운로드로
    }
  }
  download(blob, name);
  return 'saved';
}
