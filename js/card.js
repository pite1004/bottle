// 공유 카드: 1080×1920 canvas — 하늘·바다, 잠긴 도시, 병, 글귀, 서비스 이름.
import { bottleSVG } from './bottle.js';

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

  // 병
  const svg = bottleSVG(bottle).replace('<svg ', '<svg width="300" height="600" ');
  const img = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  ctx.drawImage(img, (W - 300) / 2, HORIZON + 60, 300, 600);

  // 글귀 (종이 카드 위에)
  ctx.font = fontCss;
  const lines = wrap(ctx, bottle.text, 800);
  const lineH = f.size * f.line;
  const boxH = lines.length * lineH + 120;
  const boxY = HORIZON + 720;
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
// 돌려주는 값: 'shared' | 'saved' | 'cancelled'
export async function shareOrSave(blob, how) {
  const stamp = new Date().toISOString().slice(0, 19).replace(/\D/g, '');
  const name = `bottle-letter-${stamp}.png`; // 저장할 때마다 이름이 달라 덮어쓰지 않게
  const file = new File([blob], name, { type: 'image/png' });
  const canShare = navigator.canShare && navigator.canShare({ files: [file] });
  if (canShare && (how === 'share' || isIOS)) {
    try {
      await navigator.share({ files: [file], title: '유리병 편지' });
      return 'shared';
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      // 공유가 막히면 다운로드로
    }
  }
  download(blob, name);
  return 'saved';
}
