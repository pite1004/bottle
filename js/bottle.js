// 병·쓰레기 SVG 생성. viewBox 0 0 60 120, 아래쪽 중앙(30,120)이 기준점.

export const GLASS = {
  clear: '#e9f1f5',
  green: '#cfe8c6',
  sky: '#cfe3f3',
  amber: '#ecd3a8',
};

const CORK = {
  cork: '#b88a5a',
  wax: '#b5523b',
  ribbon: '#5b8fc7',
  seaglass: '#8fd0c8',
};

const GLASS_EDGE = '#8a98a5';

// mouth: 입구 y, neck: 목 좌우 x, body: 몸통 상자(종이·넣을 것 배치용), hl: 하이라이트 선
const SHAPES = {
  wine: {
    d: 'M25 16 L35 16 L35 46 C35 56 52 58 52 72 L52 112 Q52 118 46 118 L14 118 Q8 118 8 112 L8 72 C8 58 25 56 25 46 Z',
    mouth: 16, neck: [25, 35], body: { top: 66, bottom: 116, l: 8, r: 52 },
    hl: 'M14 76 C13 88 13 100 14 110',
  },
  vial: {
    d: 'M26 50 L34 50 L34 58 C34 62 42 62 42 68 L42 112 Q42 118 36 118 L24 118 Q18 118 18 112 L18 68 C18 62 26 62 26 58 Z',
    mouth: 50, neck: [26, 34], body: { top: 68, bottom: 116, l: 18, r: 42 },
    hl: 'M22 72 C21.5 86 21.5 100 22 110',
  },
  milk: {
    d: 'M22 28 L38 28 L38 38 C38 46 48 48 48 58 L48 112 Q48 118 42 118 L18 118 Q12 118 12 112 L12 58 C12 48 22 46 22 38 Z',
    mouth: 28, neck: [22, 38], body: { top: 58, bottom: 116, l: 12, r: 48 },
    hl: 'M17 62 C16 78 16 96 17 110',
  },
  jam: {
    d: 'M14 56 L46 56 L46 62 L50 66 L50 112 Q50 118 44 118 L16 118 Q10 118 10 112 L10 66 L14 62 Z',
    mouth: 56, neck: [14, 46], body: { top: 66, bottom: 116, l: 10, r: 50 },
    hl: 'M15 70 C14.5 84 14.5 98 15 110',
  },
};

let uid = 0;

export function bottleSVG({ shape = 'wine', color = 'clear', cork = 'cork', inside = 'none' } = {}) {
  const s = SHAPES[shape] || SHAPES.wine;
  const glass = GLASS[color] || GLASS.clear;
  const clipId = `bclip${++uid}`;
  return `<svg viewBox="0 0 60 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs><clipPath id="${clipId}"><path d="${s.d}"/></clipPath></defs>
  <path d="${s.d}" fill="${glass}" fill-opacity=".6"/>
  <g clip-path="url(#${clipId})">${insideSVG(inside, s.body)}${paperSVG(s.body)}</g>
  <path d="${s.d}" fill="${glass}" fill-opacity=".3" stroke="${GLASS_EDGE}" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="${s.hl}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="3" stroke-linecap="round"/>
  ${corkSVG(cork, s)}
</svg>`;
}

// 돌돌 만 종이
function paperSVG(b) {
  const cx = (b.l + b.r) / 2;
  const h = (b.bottom - b.top) * 0.62;
  const w = Math.min(14, (b.r - b.l) * 0.42);
  const y = b.top + (b.bottom - b.top) * 0.12;
  const cy = y + h / 2;
  return `<g transform="rotate(-14 ${cx} ${cy})">
    <rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="${w / 2.4}" fill="#f6efdd" stroke="#d6c8aa" stroke-width="1"/>
    <path d="M${cx - w / 2 + 2} ${y + 3} L${cx - w / 2 + 2} ${y + h - 3}" stroke="#e2d6bb" stroke-width="1.2"/>
    <rect x="${cx - w / 2 - 0.5}" y="${cy - 1.5}" width="${w + 1}" height="3" fill="#a07a56"/>
  </g>`;
}

function insideSVG(kind, b) {
  const y = b.bottom - 1;
  const cx = (b.l + b.r) / 2;
  if (kind === 'flower') {
    return `<g stroke-linecap="round">
      <path d="M${cx - 6} ${y} Q${cx - 8} ${y - 10} ${cx - 10} ${y - 18}" stroke="#7c9a62" stroke-width="1.4" fill="none"/>
      <path d="M${cx + 4} ${y} Q${cx + 6} ${y - 8} ${cx + 9} ${y - 14}" stroke="#7c9a62" stroke-width="1.4" fill="none"/>
      <circle cx="${cx - 10}" cy="${y - 19}" r="3.2" fill="#d98fa0"/>
      <circle cx="${cx - 10}" cy="${y - 19}" r="1.2" fill="#f0c36b"/>
      <circle cx="${cx + 9}" cy="${y - 15}" r="2.6" fill="#c9a3d6"/>
      <circle cx="${cx + 9}" cy="${y - 15}" r="1" fill="#f0c36b"/>
    </g>`;
  }
  if (kind === 'shell') {
    const x = b.l + 6;
    return `<g>
      <path d="M${x} ${y} L${x + 12} ${y} Q${x + 13} ${y - 9} ${x + 6} ${y - 11} Q${x - 1} ${y - 9} ${x} ${y} Z" fill="#f2d4c4" stroke="#c89a86" stroke-width=".9"/>
      <path d="M${x + 6} ${y} L${x + 6} ${y - 10} M${x + 3} ${y} L${x + 4} ${y - 9} M${x + 9} ${y} L${x + 8} ${y - 9}" stroke="#c89a86" stroke-width=".7"/>
    </g>`;
  }
  if (kind === 'stardust') {
    const dots = [[-12, -3, 1.4], [-6, -6, 1], [-1, -2, 1.6], [5, -5, 1.1], [10, -2, 1.3], [-9, -9, .9], [7, -10, .9], [1, -8, 1.2]];
    return `<g>${dots.map(([dx, dy, r], i) =>
      `<circle cx="${cx + dx}" cy="${y + dy}" r="${r}" fill="${i % 3 === 0 ? '#ffffff' : '#e8c66a'}"/>`).join('')}
      <path d="M${cx + 2} ${y - 16} l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z" fill="#e8c66a"/>
    </g>`;
  }
  return '';
}

function corkSVG(kind, s) {
  const [l, r] = s.neck;
  const w = r - l;
  const m = s.mouth;
  const c = CORK[kind] || CORK.cork;
  if (kind === 'wax') {
    return `<g>
      <path d="M${l - 2} ${m - 6} Q${l - 2} ${m - 9} ${l + 1} ${m - 9} L${r - 1} ${m - 9} Q${r + 2} ${m - 9} ${r + 2} ${m - 6}
        L${r + 2} ${m + 6} Q${r + 1} ${m + 10} ${r - 1} ${m + 6} L${r - 3} ${m + 3} Q${r - 6} ${m + 8} ${r - 8} ${m + 3}
        L${l + 4} ${m + 3} Q${l + 2} ${m + 12} ${l} ${m + 5} L${l - 2} ${m + 4} Z" fill="${c}"/>
      <ellipse cx="${(l + r) / 2}" cy="${m - 7}" rx="${w / 2 - 1}" ry="1.4" fill="#fff" fill-opacity=".25"/>
    </g>`;
  }
  if (kind === 'ribbon') {
    const by = m + 7;
    return `<g>
      <rect x="${l - 1}" y="${m - 9}" width="${w + 2}" height="12" rx="2" fill="${CORK.cork}"/>
      <rect x="${l - 0.5}" y="${by}" width="${w + 1}" height="4" fill="${c}"/>
      <path d="M${r} ${by + 2} q6 -6 9 -1 q-3 4 -9 1 z M${r} ${by + 2} q7 3 6 7 q-5 0 -6 -7 z" fill="${c}"/>
      <path d="M${r} ${by + 2} l3 10 M${r} ${by + 2} l7 8" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>
    </g>`;
  }
  if (kind === 'seaglass') {
    return `<g>
      <rect x="${l - 1.5}" y="${m - 8}" width="${w + 3}" height="11" rx="4" fill="${c}" stroke="#5fa79e" stroke-width="1"/>
      <path d="M${(l + r) / 2 - 4} ${m - 8} L${(l + r) / 2 - 2} ${m - 14} L${(l + r) / 2 + 3} ${m - 13} L${(l + r) / 2 + 4} ${m - 8} Z" fill="#bfe6e1" stroke="#5fa79e" stroke-width="1"/>
      <path d="M${l + 1} ${m - 5} L${l + 4} ${m - 5}" stroke="#fff" stroke-opacity=".7" stroke-width="1.4" stroke-linecap="round"/>
    </g>`;
  }
  return `<g>
    <rect x="${l - 1}" y="${m - 9}" width="${w + 2}" height="12" rx="2" fill="${c}"/>
    <circle cx="${l + w * 0.3}" cy="${m - 5}" r=".9" fill="#946b44"/>
    <circle cx="${l + w * 0.7}" cy="${m - 2}" r=".8" fill="#946b44"/>
    <circle cx="${l + w * 0.55}" cy="${m - 7}" r=".6" fill="#946b44"/>
  </g>`;
}

export const TRASH_KINDS = ['pet', 'vinyl', 'can'];

export const TRASH_NAMES = { pet: '페트병', vinyl: '비닐', can: '녹슨 캔' };

export function trashSVG(kind) {
  if (kind === 'vinyl') {
    return `<svg viewBox="0 0 60 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M12 72 Q10 66 16 62 L18 54 Q20 46 24 54 L24 62 L36 62 L36 54 Q40 46 42 54 L44 62 Q50 66 48 74
    L50 104 Q46 116 36 112 Q30 118 22 112 Q12 116 10 104 Z" fill="#f4f6f8" fill-opacity=".8" stroke="#b8c2cb" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M18 80 Q24 86 22 98 M36 78 Q32 90 38 100" stroke="#cfd6dd" stroke-width="1.2" fill="none"/>
  <path d="M15 76 C14 86 15 96 17 104" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/>
</svg>`;
  }
  if (kind === 'can') {
    return `<svg viewBox="0 0 60 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M17 66 L43 66 L45 112 Q45 118 30 118 Q15 118 15 112 Z" fill="#a2683f"/>
  <ellipse cx="30" cy="66" rx="13" ry="3.5" fill="#8c8f93"/>
  <ellipse cx="30" cy="66" rx="9" ry="2" fill="#6f7276"/>
  <path d="M22 80 q4 -3 7 1 q3 4 -2 6 q-6 1 -5 -7z M33 96 q5 -2 7 3 q0 5 -6 3z M19 104 q3 0 3 4 q-3 2 -4 -1z" fill="#7c4a2a"/>
  <path d="M20 72 L19 110" stroke="#fff" stroke-opacity=".35" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M16 84 L44 86" stroke="#7c4a2a" stroke-width="1"/>
</svg>`;
  }
  return `<svg viewBox="0 0 60 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="25" y="40" width="10" height="7" rx="1.5" fill="#3f7fb5"/>
  <path d="M26 47 L34 47 L35 54 Q44 58 43 68 L41 78 L45 86 L42 96 L44 112 Q44 118 30 118 Q16 118 16 112 L19 98 L15 88 L19 78 L17 68 Q16 58 25 54 Z"
    fill="#dfeef5" fill-opacity=".85" stroke="#8fb0c4" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M17.5 82 L43.5 84 L42 96 L18.5 94 Z" fill="#7fb2d6" fill-opacity=".7"/>
  <path d="M21 62 C20 72 21 80 20 90" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none" stroke-opacity=".8"/>
</svg>`;
}
