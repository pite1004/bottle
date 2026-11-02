// 1인칭 바다: 병·쓰레기 생성과 원근 이동, 출렁임, 낚싯대, 낚시 인터랙션.
import { bottleSVG, trashSVG, TRASH_KINDS } from './bottle.js';

const HORIZON = 0.30;      // 하늘이 차지하는 비율 (style.css의 --horizon과 같게)
const APPROACH = 0.012;    // 초당 z 증가량
const Z_END = 1.05;        // 이 값을 넘으면 사라짐
const TRASH_RATE = 0.1;
const MAX_FLOATERS = 7;
const CATCH_RADIUS = 40;   // 바늘이 떨어진 곳에서 이 거리(px) 안에 있으면 걸린다. 가까운 큰 병은 더 넓게.
const MISS_TIME = 0.9;     // 허탕일 때 바늘이 물에 머무는 시간(초)

const CAST_TIME = 0.6;     // 줄이 뻗어 나가는 시간(초)
const REEL_UP = 1 / 1.8;   // 누르고 있을 때 초당 진행률 증가
const REEL_DOWN = 1 / 3;   // 뗐을 때 초당 감소
const Z_LANDED = 1.25;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function createSea(scene, {
  onEmptyChange = () => {},
  onHook = () => {},
  onProgress = () => {},
  onLanded = () => {},
} = {}) {
  const layer = scene.querySelector('.floaters');
  const effects = scene.querySelector('.effects');
  const rod = scene.querySelector('.rod');
  const rodBody = rod.querySelector('.rod-body');
  const rodShaft = rod.querySelector('.rod-shaft');
  const rodGrip = rod.querySelector('.rod-grip');
  const rodRings = rod.querySelector('.rod-rings');
  const rodTip = rod.querySelector('.rod-tip');
  const rodLine = rod.querySelector('.rod-line');
  const rodHook = rod.querySelector('.rod-hook');

  let W = 0, H = 0, horizon = 0, seaH = 0;
  let butt = { x: 0, y: 0 };
  let tip = { x: 0, y: 0 };
  let pool = [];
  let queue = [];
  let floaters = [];
  let spawnTimer = 0;
  let running = false;
  let last = 0;
  let time = 0;
  let wasEmpty = null;
  // 낚시 상태. f는 걸린 대상(던지는 중·허탕이면 null), target은 바늘이 떨어질 곳
  let fish = null; // { f, target, phase: 'cast'|'miss'|'hooked'|'landing', t, p, z0, lane0, holding }

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
    butt = { x: W + 14, y: H + 26 };
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

  // 끌어올리는 동안 낚싯대가 미세하게 떨린다. 떨린 뒤의 끝 위치를 돌려준다.
  function shakeRod() {
    let deg = 0;
    if (fish && fish.phase === 'hooked' && fish.holding) {
      deg = Math.sin(time * 38) * 1.5 * fish.p * motionScale();
    }
    rodBody.setAttribute('transform', deg ? `rotate(${deg.toFixed(3)} ${butt.x} ${butt.y})` : '');
    const a = (deg * Math.PI) / 180;
    const x = tip.x - butt.x, y = tip.y - butt.y;
    return {
      x: butt.x + x * Math.cos(a) - y * Math.sin(a),
      y: butt.y + x * Math.sin(a) + y * Math.cos(a),
    };
  }

  // 대기 중: 낚싯대 끝에서 짧게 늘어진 줄
  function drawIdleLine(t0) {
    const sway = Math.sin(time * 1.3) * 3 * motionScale();
    const endX = t0.x + 5 + sway, endY = t0.y + 34;
    rodLine.setAttribute('d', `M${t0.x} ${t0.y} Q${t0.x + 10 + sway} ${t0.y + 12} ${endX} ${endY}`);
    drawHook(endX, endY);
  }

  // 낚시 중: 낚싯대 끝 ↔ 바늘(걸렸으면 대상 목 부분)을 잇는 2차 베지어
  function drawFishLine(t0) {
    const f = fish.f;
    const end = f ? { x: f.x, y: f.y - 104 * f.s } : fish.target;
    const mid = { x: (t0.x + end.x) / 2, y: (t0.y + end.y) / 2 };
    const dist = Math.hypot(end.x - t0.x, end.y - t0.y);
    // 던질 때는 높이 휘고, 팽팽해질수록 직선에 가깝게. 허탕이면 느슨하게 처진다.
    const lift = fish.phase === 'cast' ? dist * 0.45
      : fish.phase === 'miss' ? -dist * 0.06
      : dist * 0.22 * (1 - fish.p) + 2;
    const c = { x: mid.x, y: mid.y - lift };
    const k = fish.phase === 'cast' ? easeOut(Math.min(1, fish.t)) : 1;
    // 0~k 구간만 그리기 (de Casteljau)
    const q1 = { x: t0.x + (c.x - t0.x) * k, y: t0.y + (c.y - t0.y) * k };
    const q2 = { x: c.x + (end.x - c.x) * k, y: c.y + (end.y - c.y) * k };
    const p = { x: q1.x + (q2.x - q1.x) * k, y: q1.y + (q2.y - q1.y) * k };
    rodLine.setAttribute('d', `M${t0.x} ${t0.y} Q${q1.x} ${q1.y} ${p.x} ${p.y}`);
    drawHook(p.x, p.y);
  }

  function drawHook(x, y) {
    rodHook.setAttribute('d', `M${x} ${y} l0 4 q0 3 2.6 3 q2.4 0 2.4 -2.6`);
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
    // 이미 건진 병 등 목록에서 빠진 병이 화면에 남아 있으면 치운다.
    const ids = new Set(pool.map((b) => b.id));
    for (const f of floaters.slice()) {
      if (f.kind === 'bottle' && !ids.has(f.data.id) && (!fish || fish.f !== f)) remove(f);
    }
    if (!running) return;
    checkEmpty();
  }

  function checkEmpty() {
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
      x: 0, y: 0, s: 0,
    };
    // 키보드(Enter/Space)로 누른 경우. 터치·마우스는 scene에서 가까운 병을 찾는다.
    el.addEventListener('click', (e) => {
      if (e.detail === 0) castAt(f.x, f.y - 55 * f.s);
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
    const fadeOut = f.held ? 1 : Math.min(1, (Z_END - z) / 0.06);
    f.x = x;
    f.y = y + bob;
    f.s = s;
    f.el.style.transform = `translate3d(${x - 30}px, ${y + bob - 120}px, 0) rotate(${tilt.toFixed(2)}deg) scale(${s.toFixed(4)})`;
    f.el.style.opacity = Math.max(0, Math.min(fadeIn, fadeOut)).toFixed(3);
    f.el.style.zIndex = String(f.held ? 1200 : Math.round(z * 1000));
  }

  // ---------- 낚시 ----------
  // 바다 어디든 탭한 곳으로 바늘을 던진다. 수평선 위를 탭하면 수평선 바로 아래로.
  function castAt(x, y) {
    if (fish || !running) return;
    fish = {
      f: null,
      target: { x: Math.max(8, Math.min(W - 8, x)), y: Math.max(horizon + 6, Math.min(H - 8, y)) },
      phase: 'cast', t: 0, p: 0, holding: false,
    };
  }

  // 바늘이 떨어진 곳 근처에서 가장 가까운 병·쓰레기
  function catchAt({ x, y }) {
    let best = null, bestD = Infinity;
    for (const f of floaters) {
      const d = Math.hypot(x - f.x, y - (f.y - 55 * f.s)); // 병 몸통 가운데까지
      if (d < Math.max(CATCH_RADIUS, 60 * f.s) && d < bestD) {
        best = f;
        bestD = d;
      }
    }
    return best;
  }

  function hook(f) {
    f.held = true; // 다가오기를 멈추고 출렁임만 유지
    Object.assign(fish, { f, phase: 'hooked', z0: f.z, lane0: f.lane });
    ripple(f.x, f.y - 6 * f.s);
    bubble(f.x, f.y - 120 * f.s - 12, '걸렸어요!');
    if (navigator.vibrate) navigator.vibrate(40);
    onHook(f);
  }

  function updateFish(dt) {
    if (fish.phase === 'cast') {
      fish.t += dt / CAST_TIME;
      if (fish.t >= 1) {
        const f = catchAt(fish.target);
        if (f) {
          hook(f);
        } else {
          fish.phase = 'miss';
          fish.t = 0;
          ripple(fish.target.x, fish.target.y);
          bubble(fish.target.x, fish.target.y - 14, '아무것도 걸리지 않았어요', true);
        }
      }
      return;
    }
    if (fish.phase === 'miss') {
      fish.t += dt;
      if (fish.t >= MISS_TIME) fish = null; // 줄을 거둬들이고 다시 던질 수 있게
      return;
    }
    if (fish.phase !== 'hooked') return;
    const f = fish.f;
    const before = fish.p;
    fish.p += fish.holding ? REEL_UP * dt : -REEL_DOWN * dt;
    fish.p = Math.max(0, Math.min(1, fish.p));
    const e = easeOut(fish.p);
    f.z = fish.z0 + (Z_LANDED - fish.z0) * e;
    // 앞으로 끌려오면서 낚싯대 쪽으로 모인다 (화면 밖으로 퍼지지 않게)
    f.lane = fish.lane0 + (0.56 - fish.lane0) * e * 0.8;
    if (fish.p !== before) onProgress(fish.p);
    if (fish.p >= 1) land();
  }

  function land() {
    const f = fish.f;
    fish.phase = 'landing';
    splash(f.x, Math.min(f.y, H) - 40);
    f.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, fill: 'forwards' });
    setTimeout(() => {
      remove(f);
      fish = null;
      onLanded(f);
    }, 380);
  }

  // 놓아주기: 다시 떠다니게 둔다
  function release() {
    if (!fish || fish.phase === 'landing') return;
    if (fish.f) fish.f.held = false;
    fish = null;
    effects.innerHTML = '';
  }

  function hold(on) {
    if (fish && fish.phase === 'hooked') fish.holding = on;
  }

  // ---------- 효과 ----------
  function ripple(x, y) {
    for (let i = 0; i < 2; i++) {
      const r = document.createElement('div');
      r.className = 'ripple';
      r.style.left = `${x}px`;
      r.style.top = `${y}px`;
      effects.appendChild(r);
      r.animate(
        [{ transform: 'scale(1)', opacity: 0.9 }, { transform: 'scale(4.5)', opacity: 0 }],
        { duration: 800, delay: i * 220, easing: 'ease-out', fill: 'both' },
      ).onfinish = () => r.remove();
    }
  }

  function bubble(x, y, text, quiet = false) {
    const b = document.createElement('div');
    b.className = quiet ? 'hook-bubble quiet' : 'hook-bubble';
    b.textContent = text;
    x = Math.max(90, Math.min(W - 90, x)); // 말풍선이 화면 밖으로 잘리지 않게
    b.style.left = `${x}px`;
    b.style.top = `${Math.max(36, y)}px`;
    effects.appendChild(b);
    b.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -80%) scale(.7)' },
        { opacity: 1, transform: 'translate(-50%, -100%) scale(1.05)', offset: 0.15 },
        { opacity: 1, transform: 'translate(-50%, -100%) scale(1)', offset: 0.8 },
        { opacity: 0, transform: 'translate(-50%, -120%) scale(1)' },
      ],
      { duration: 1600, easing: 'ease-out', fill: 'forwards' },
    ).onfinish = () => b.remove();
  }

  function splash(x, y) {
    const flash = document.createElement('div');
    flash.className = 'ripple';
    flash.style.left = `${x}px`;
    flash.style.top = `${y}px`;
    effects.appendChild(flash);
    flash.animate(
      [{ transform: 'scale(2)', opacity: 1 }, { transform: 'scale(9)', opacity: 0 }],
      { duration: 600, easing: 'ease-out', fill: 'forwards' },
    ).onfinish = () => flash.remove();
    for (let i = 0; i < 14; i++) {
      const d = document.createElement('div');
      d.className = 'drop';
      d.style.left = `${x}px`;
      d.style.top = `${y}px`;
      effects.appendChild(d);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const dist = 50 + Math.random() * 90;
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
      d.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(.6)`, opacity: 0.9, offset: 0.6 },
          { transform: `translate(${dx * 1.2}px, ${dy + 40}px) scale(.3)`, opacity: 0 },
        ],
        { duration: 650, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' },
      ).onfinish = () => d.remove();
    }
  }

  // ---------- 루프 ----------
  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    time += dt;

    for (const f of floaters.slice()) {
      if (!f.held) f.z += APPROACH * dt;
      if (!f.held && f.z > Z_END) remove(f);
    }

    spawnTimer -= dt;
    if (floaters.length < targetCount() && spawnTimer <= 0) {
      spawn(0);
      // 깊이가 고르게 퍼지도록 간격을 둔다. 비었을 땐 더 드물게.
      const gap = (1 / APPROACH) / targetCount();
      spawnTimer = pool.length === 0 ? gap * 1.5 : gap * (0.6 + Math.random() * 0.5);
    }

    if (fish) updateFish(dt);
    for (const f of floaters) place(f);
    const t0 = shakeRod();
    if (fish && fish.phase !== 'landing') drawFishLine(t0);
    else drawIdleLine(t0);
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
    checkEmpty();
    last = performance.now();
    requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
  }

  // ---------- 탭: 탭한 곳으로 던지기 ----------
  scene.addEventListener('pointerup', (e) => {
    const r = scene.getBoundingClientRect();
    castAt(e.clientX - r.left, e.clientY - r.top);
  });

  new ResizeObserver(() => layout()).observe(scene);

  return {
    start,
    stop,
    setPool,
    hold,
    release,
    get busy() { return !!fish; },
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
