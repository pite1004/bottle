// 1인칭 바다: 병·쓰레기 생성과 원근 이동, 출렁임, 낚싯대.
import { bottleSVG, trashSVG, TRASH_KINDS } from './bottle.js';

const HORIZON = 0.30;      // 하늘이 차지하는 비율 (style.css의 --horizon과 같게)
const APPROACH = 0.012;    // 초당 z 증가량
const Z_END = 1.05;        // 이 값을 넘으면 사라짐
const TRASH_RATE = 0.1;
const MAX_FLOATERS = 7;
const TAP_RADIUS = 30;     // 멀리 있는 작은 병도 누르기 쉽게 하는 최소 반경(px)

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function createSea(scene, { onTap = () => {}, onEmptyChange = () => {} } = {}) {
  const layer = scene.querySelector('.floaters');
  const rod = scene.querySelector('.rod');
  const rodShaft = rod.querySelector('.rod-shaft');
  const rodGrip = rod.querySelector('.rod-grip');
  const rodRings = rod.querySelector('.rod-rings');
  const rodTip = rod.querySelector('.rod-tip');
  const rodLine = rod.querySelector('.rod-line');

  let W = 0, H = 0, horizon = 0, seaH = 0;
  let tip = { x: 0, y: 0 };
  let pool = [];
  let queue = [];
  let floaters = [];
  let spawnTimer = 0;
  let running = false;
  let last = 0;
  let time = 0;
  let wasEmpty = null;

  // ---------- 크기·낚싯대 ----------
  function layout() {
    const r = scene.getBoundingClientRect();
    W = r.width;
    H = r.height;
    horizon = H * HORIZON;
    seaH = H - horizon;
    rod.setAttribute('viewBox', `0 0 ${W} ${H}`);
    drawRod();
    drawCity();
  }

  function drawRod() {
    const butt = { x: W + 14, y: H + 26 };
    tip = { x: W * 0.64, y: horizon + seaH * 0.40 };
    const dx = tip.x - butt.x, dy = tip.y - butt.y;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len; // 수직 방향
    const at = (t, half) => [butt.x + dx * t + nx * half, butt.y + dy * t + ny * half];
    const seg = (t0, t1, w0, w1) => {
      const a = at(t0, w0 / 2), b = at(t1, w1 / 2), c = at(t1, -w1 / 2), d = at(t0, -w0 / 2);
      return `M${a} L${b} L${c} L${d} Z`;
    };
    rodShaft.setAttribute('d', seg(0, 1, 9, 2.2));
    rodGrip.setAttribute('d', seg(0, 0.24, 13, 10));
    rodRings.innerHTML = [0.42, 0.66, 0.86].map((t, i) => {
      const [x, y] = at(t, -(5 - i));
      return `<circle cx="${x}" cy="${y}" r="${3 - i * 0.6}"/>`;
    }).join('');
    rodTip.setAttribute('cx', tip.x);
    rodTip.setAttribute('cy', tip.y);
  }

  // 대기 중: 낚싯대 끝에서 짧게 늘어진 줄
  function drawIdleLine() {
    const sway = Math.sin(time * 1.3) * 3 * motionScale();
    const endX = tip.x + 5 + sway, endY = tip.y + 34;
    rodLine.setAttribute('d', `M${tip.x} ${tip.y} Q${tip.x + 10 + sway} ${tip.y + 12} ${endX} ${endY}`);
  }

  // 수평선 위로 꼭대기만 보이는 잠긴 도시
  let cityDrawn = false;
  function drawCity() {
    if (cityDrawn) return;
    cityDrawn = true;
    const svg = scene.querySelector('.city');
    const rnd = seeded(2100);
    let x = 0, parts = '', windows = '';
    while (x < 400) {
      const w = 10 + rnd() * 22;
      const h = 6 + rnd() * 26;
      if (rnd() > 0.18) {
        parts += `<rect x="${x.toFixed(1)}" y="${(40 - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/>`;
        if (rnd() > 0.6) parts += `<rect x="${(x + w / 2 - 0.6).toFixed(1)}" y="${(40 - h - 7).toFixed(1)}" width="1.2" height="7"/>`;
        if (rnd() > 0.55) {
          windows += `<rect class="window" x="${(x + 3 + rnd() * (w - 7)).toFixed(1)}" y="${(40 - h + 3 + rnd() * (h - 6)).toFixed(1)}" width="2" height="2"/>`;
        }
      }
      x += w + rnd() * 6;
    }
    svg.setAttribute('viewBox', '0 0 400 40');
    svg.innerHTML = parts + windows;
  }

  // ---------- 병 공급 ----------
  function setPool(list) {
    pool = list.slice();
    queue = [];
    if (!running) return;
    const empty = pool.length === 0;
    if (empty !== wasEmpty) {
      wasEmpty = empty;
      onEmptyChange(empty);
    }
  }

  function nextBottle() {
    const onScreen = new Set(floaters.filter((f) => f.kind === 'bottle').map((f) => f.data.id));
    for (let tries = 0; tries < 2; tries++) {
      if (queue.length === 0) queue = shuffle(pool.slice());
      while (queue.length) {
        const b = queue.pop();
        if (!onScreen.has(b.id)) return b;
      }
    }
    return null;
  }

  function targetCount() {
    if (pool.length === 0) return 2; // 비었을 땐 쓰레기만 가끔
    return Math.min(MAX_FLOATERS, pool.length + 1);
  }

  function spawn(z) {
    let kind = Math.random() < TRASH_RATE || pool.length === 0 ? 'trash' : 'bottle';
    let data = null;
    if (kind === 'bottle') {
      data = nextBottle();
      if (!data) kind = 'trash';
    }
    if (kind === 'trash') data = { trash: TRASH_KINDS[Math.floor(Math.random() * TRASH_KINDS.length)] };

    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'floater';
    el.setAttribute('aria-label', kind === 'bottle' ? '떠다니는 유리병 건지기' : '떠다니는 무언가 건지기');
    el.innerHTML = kind === 'bottle' ? bottleSVG(data) : trashSVG(data.trash);

    const f = {
      el, kind, data, z,
      lane: pickLane(z),
      phase: Math.random() * Math.PI * 2,
      freq: 1.1 + Math.random() * 0.6,
      held: false,
    };
    // 키보드(Enter/Space)로 누른 경우. 터치·마우스는 scene에서 가까운 병을 찾는다.
    el.addEventListener('click', (e) => {
      if (e.detail === 0) onTap(f);
    });
    layer.appendChild(el);
    floaters.push(f);
    return f;
  }

  // 비슷한 깊이의 다른 병과 좌우로 겹치지 않는 자리
  function pickLane(z) {
    let best = 0.5, bestScore = -1;
    for (let i = 0; i < 8; i++) {
      const lane = 0.06 + Math.random() * 0.88;
      let score = 1;
      for (const f of floaters) {
        if (Math.abs(f.z - z) < 0.3) score = Math.min(score, Math.abs(f.lane - lane));
      }
      if (score > bestScore) { bestScore = score; best = lane; }
    }
    return best;
  }

  function remove(f) {
    f.el.remove();
    floaters = floaters.filter((o) => o !== f);
  }

  // ---------- 위치 계산 ----------
  function motionScale() {
    return reducedMotion.matches ? 0.3 : 1;
  }

  function place(f) {
    const z = f.z;
    const s = 0.15 + z * 1.0;
    const x = W / 2 + (f.lane - 0.5) * W * (0.4 + z * 1.1);
    const y = horizon + Math.pow(Math.max(z, 0), 1.6) * seaH * 0.85;
    const m = motionScale();
    const bob = Math.sin(time * f.freq + f.phase) * 7 * s * m;
    const tilt = Math.sin(time * f.freq * 0.8 + f.phase + 1) * 7 * m;
    const fadeIn = Math.min(1, z / 0.05);
    const fadeOut = Math.min(1, (Z_END - z) / 0.06);
    f.x = x;
    f.y = y + bob;
    f.s = s;
    f.el.style.transform = `translate3d(${x - 30}px, ${y + bob - 120}px, 0) rotate(${tilt.toFixed(2)}deg) scale(${s.toFixed(4)})`;
    f.el.style.opacity = Math.max(0, Math.min(fadeIn, fadeOut)).toFixed(3);
    f.el.style.zIndex = String(Math.round(z * 1000));
  }

  // ---------- 루프 ----------
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    time += dt;

    for (const f of floaters.slice()) {
      if (!f.held) f.z += APPROACH * dt;
      if (f.z > Z_END) remove(f);
    }

    spawnTimer -= dt;
    if (floaters.length < targetCount() && spawnTimer <= 0) {
      spawn(0);
      // 깊이가 고르게 퍼지도록 간격을 둔다. 비었을 땐 더 드물게.
      const gap = (1 / APPROACH) / targetCount();
      spawnTimer = pool.length === 0 ? gap * 1.5 : gap * (0.6 + Math.random() * 0.5);
    }

    for (const f of floaters) place(f);
    drawIdleLine();
    requestAnimationFrame(frame);
  }

  // 처음 열었을 때 화면이 비어 있지 않게 깊이를 고르게 채운다.
  function fillInitial() {
    const n = targetCount();
    for (let i = 0; i < n; i++) {
      const z = ((i + 0.2 + Math.random() * 0.6) / n) * 0.92;
      spawn(z);
    }
    spawnTimer = (1 / APPROACH) / n;
  }

  function start() {
    if (running) return;
    running = true;
    layout();
    if (floaters.length === 0) fillInitial();
    const empty = pool.length === 0;
    if (empty !== wasEmpty) {
      wasEmpty = empty;
      onEmptyChange(empty);
    }
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
  }

  // ---------- 탭: 가장 가까운 병 찾기 ----------
  function hitTest(px, py) {
    let best = null, bestD = Infinity;
    for (const f of floaters) {
      const cy = f.y - 60 * f.s; // 병 가운데
      const radius = Math.max(TAP_RADIUS, 50 * f.s);
      const d = Math.hypot(px - f.x, py - cy);
      if (d < radius && (d < bestD || (best && f.z > best.z && d < radius * 0.8))) {
        best = f;
        bestD = d;
      }
    }
    return best;
  }

  scene.addEventListener('pointerup', (e) => {
    const r = scene.getBoundingClientRect();
    const f = hitTest(e.clientX - r.left, e.clientY - r.top);
    if (f) onTap(f);
  });

  new ResizeObserver(() => layout()).observe(scene);

  return {
    start,
    stop,
    setPool,
    get tip() { return tip; },
    get floaters() { return floaters; },
  };
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
