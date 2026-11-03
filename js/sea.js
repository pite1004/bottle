// 1인칭 바다: 병·쓰레기가 해류를 따라 한 방향으로 흐르고, 출렁이고, 낚싯대로 건진다.
import { bottleSVG, seaBottleSVG, trashSVG, TRASH_KINDS } from './bottle.js';

const HORIZON = 0.30;      // 하늘이 차지하는 비율 (style.css의 --horizon과 같게)
export const FLOW_DIR = 1; // 해류 방향: 1 = 왼쪽 → 오른쪽, -1 = 오른쪽 → 왼쪽 (물결·반짝임 CSS도 같은 방향)
const Z_MIN = 0.12;        // 생성 깊이 범위 (0 = 수평선, 1 = 바로 앞)
const Z_MAX = 0.95;
const SPEED_FAR = 12;      // 가장 먼 병의 흐름 속도 (px/초)
const SPEED_NEAR = 40;     // 가장 가까운 병의 흐름 속도
const TARGET_COUNT = 9;    // 화면 바깥에서 막 생긴 것까지 세서, 화면 안엔 6~9개가 보이도록
const Z_GAP = 0.08;        // 같은 깊이대에 너무 붙지 않게
const TRASH_RATE = 0.1;
const CATCH_RADIUS = 40;   // 바늘이 떨어진 곳에서 이 거리(px) 안에 있으면 걸린다. 가까운 큰 병은 더 넓게. (터치 영역 44×44 이상)
const MISS_TIME = 0.9;     // 허탕일 때 바늘이 물에 머무는 시간(초)

const CAST_TIME = 0.6;     // 줄이 뻗어 나가는 시간(초)
const REEL_UP = 1 / 1.8;   // 누르고 있을 때 초당 진행률 증가
const REEL_DOWN = 1 / 3;   // 뗐을 때 초당 감소
const Z_LANDED = 1.25;

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function createSea(scene, {
  onEmptyChange = () => {},
  onCast = () => {},
  onHook = () => {},
  onEscape = () => {},
  onSpecialAppear = () => {},
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
  let special = []; // 바다가 보낸 병 (일반 병보다 먼저 떠내려온다)
  let queue = [];
  let floaters = [];
  let spawnTimer = 0; // 다음 생성까지 남은 시간(초)
  let running = false;
  let last = 0;
  let time = 0;
  let wasEmpty = null;
  // 낚시 상태. f는 걸린 대상, aim은 던질 때 노린 대상(계속 흐름), target은 바늘이 떨어질 곳
  let fish = null; // { f, aim, target, phase: 'cast'|'miss'|'hooked'|'landing', t, p, maxP, z0, x0, holding }

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

  // 병의 목 부분 (줄이 매이는 곳)
  function neckOf(f) {
    return { x: f.x, y: f.y - (f.h - 16) * f.s };
  }

  // 낚시 중: 낚싯대 끝 ↔ 바늘(노린·걸린 대상의 목 부분)을 잇는 2차 베지어
  function drawFishLine(t0) {
    const f = fish.f || (fish.phase === 'cast' ? fish.aim : null);
    const end = f ? neckOf(f) : fish.target; // 노린 대상이 흘러가면 줄 끝이 따라간다
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
      if (f.kind === 'bottle' && !f.data.special && !ids.has(f.data.id) && (!fish || fish.f !== f)) remove(f);
    }
    if (!running) return;
    checkEmpty();
  }

  // 바다가 보낸 병 목록. 새로 생기면 곧바로 상류에서 떠내려오게 한다.
  function setSpecial(list) {
    const before = new Set(special.map((s) => s.id));
    special = list.slice();
    if (special.some((s) => !before.has(s.id))) spawnTimer = Math.min(spawnTimer, 1.5);
  }

  // 바다가 보낸 병은 동시에 1개만
  function nextSpecial() {
    if (floaters.some((f) => f.data.special)) return null;
    return special[0] || null;
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
    return Math.min(TARGET_COUNT, pool.length + 2); // 병이 적을 땐 같은 병이 겹쳐 나오지 않게
  }

  // 흐름 속도: 가까울수록 빠르게 + 병마다 약간 다르게
  function speedFor(z) {
    const k = (z - Z_MIN) / (Z_MAX - Z_MIN);
    return (SPEED_FAR + (SPEED_NEAR - SPEED_FAR) * k) * (0.85 + Math.random() * 0.3);
  }

  // 상류 쪽 화면 바깥 x
  function upstreamX(s, w) {
    const half = (w / 2) * s + 12;
    return FLOW_DIR > 0 ? -half : W + half;
  }

  function isDownstreamOut(f) {
    const half = (f.w / 2) * f.s + 12;
    return FLOW_DIR > 0 ? f.x - half > W : f.x + half < 0;
  }

  // 같은 깊이대에 너무 붙지 않는 깊이 (가까이 있는 것들과 비교)
  function pickZ(atX) {
    let best = Z_MIN + Math.random() * (Z_MAX - Z_MIN), bestGap = -1;
    for (let i = 0; i < 10; i++) {
      const z = Z_MIN + Math.random() * (Z_MAX - Z_MIN);
      let gap = 1;
      for (const f of floaters) {
        if (Math.abs(f.x - atX) < 140) gap = Math.min(gap, Math.abs(f.z - z));
      }
      if (gap > bestGap) { bestGap = gap; best = z; }
      if (gap >= Z_GAP * 2) break;
    }
    return best;
  }

  // x를 주지 않으면 상류 바깥에서 생긴다. 넣을 병이 없으면 만들지 않는다.
  function spawn(x) {
    let data = nextSpecial();
    let kind = data ? 'bottle' : Math.random() < TRASH_RATE || pool.length === 0 ? 'trash' : 'bottle';
    if (kind === 'bottle' && !data) {
      data = nextBottle();
      if (!data) return null;
    }
    if (kind === 'trash') data = { trash: TRASH_KINDS[Math.floor(Math.random() * TRASH_KINDS.length)] };

    const el = document.createElement('button');
    el.type = 'button';
    el.className = data.special ? 'floater special' : 'floater';
    el.setAttribute('aria-label', data.special ? '은은하게 빛나는 병 건지기'
      : kind === 'bottle' ? '떠다니는 유리병 건지기' : '떠다니는 무언가 건지기');
    el.innerHTML = data.special ? seaBottleHTML() : kind === 'bottle' ? bottleSVG(data) : trashSVG(data.trash);

    // 그림 크기 (viewBox 0 0 60 120, 아래쪽 가운데 기준). 바다가 보낸 병은 1.6배
    const w = data.special ? 96 : 60, h = data.special ? 192 : 120;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    const z = pickZ(x ?? upstreamX(1, w));
    const s = 0.15 + z;
    const f = {
      el, kind, data, z, w, h, s,
      x: x ?? upstreamX(s, w),
      speed: speedFor(z) * (data.special ? 0.5 : 1),
      homeZ: z, // 끌려왔다 놓였을 때 돌아갈 깊이
      phase: Math.random() * Math.PI * 2,
      freq: 1.1 + Math.random() * 0.6,
      held: false,
      y: 0,
    };
    // 키보드(Enter/Space)로 누른 경우. 터치·마우스는 scene에서 탭한 곳으로 던진다.
    el.addEventListener('click', (e) => {
      if (e.detail === 0) castAt(f.x, f.y - (f.h / 2) * f.s);
    });
    layer.appendChild(el);
    floaters.push(f);
    if (data.special) onSpecialAppear(f);
    return f;
  }

  // 바다가 보낸 병: 후광·빛줄기·떠오르는 반짝이·수면 반사광 + 전용 병 (일반 병엔 없는 효과)
  function seaBottleHTML() {
    const sparks = Array.from({ length: 8 }, (_, i) =>
      `<span class="sea-spark" style="--x:${18 + Math.random() * 64}%;--d:${(-i * 0.45).toFixed(2)}s;--s:${(0.7 + Math.random() * 0.7).toFixed(2)}"></span>`).join('');
    return `<span class="sea-reflect"></span><span class="sea-halo"></span><span class="sea-beam"></span>${sparks}${seaBottleSVG()}`;
  }

  function remove(f) {
    f.el.remove();
    floaters = floaters.filter((o) => o !== f);
  }

  // ---------- 위치 계산 ----------
  function motionScale() {
    return reducedMotion.matches ? 0.3 : 1;
  }

  // 위치·크기는 원근 공식(z)으로, 좌우는 흘러온 x 그대로
  function place(f) {
    const z = f.z;
    const s = 0.15 + z * 1.0;
    const y = horizon + Math.pow(Math.max(z, 0), 1.6) * seaH * 0.85;
    const bob = Math.sin(time * f.freq + f.phase) * 7 * s * motionScale();
    // 출렁임과 함께 살짝 기울어진다 (움직임 줄이기면 기울지 않음)
    const tilt = reducedMotion.matches ? 0 : Math.sin(time * f.freq * 0.8 + f.phase + 1) * 6;
    f.y = y + bob;
    f.s = s;
    f.el.style.transform = `translate3d(${f.x - f.w / 2}px, ${f.y - f.h}px, 0) rotate(${tilt.toFixed(2)}deg) scale(${s.toFixed(4)})`;
    f.el.style.zIndex = String(f.held ? 1200 : Math.round(z * 1000)); // 먼 것 먼저
  }

  // ---------- 낚시 ----------
  // 바다 어디든 탭한 곳으로 바늘을 던진다. 수평선 위를 탭하면 수평선 바로 아래로.
  function castAt(x, y) {
    if (fish || !running) return;
    const target = { x: Math.max(8, Math.min(W - 8, x)), y: Math.max(horizon + 6, Math.min(H - 8, y)) };
    // 탭한 순간 근처에 있던 대상을 노린다. 대상은 계속 흐르고 줄 끝이 따라간다.
    fish = { f: null, aim: catchAt(target), target, phase: 'cast', t: 0, p: 0, maxP: 0, holding: false };
    onCast();
  }

  // 바늘이 떨어진 곳 근처에서 가장 가까운 병·쓰레기
  function catchAt({ x, y }) {
    let best = null, bestD = Infinity;
    for (const f of floaters) {
      const d = Math.hypot(x - f.x, y - (f.y - (f.h / 2 - 5) * f.s)); // 몸통 가운데까지
      if (d < Math.max(CATCH_RADIUS, f.h * 0.5 * f.s) && d < bestD) {
        best = f;
        bestD = d;
      }
    }
    return best;
  }

  function hook(f) {
    f.held = true; // 흐름이 멈추고 줄에 매인 채 출렁임만
    Object.assign(fish, { f, phase: 'hooked', z0: f.z, x0: f.x });
    ripple(f.x, f.y - 6 * f.s);
    bubble(f.x, f.y - f.h * f.s - 12, '걸렸어요!');
    if (navigator.vibrate) navigator.vibrate(40);
    onHook(f);
  }

  function updateFish(dt) {
    if (fish.phase === 'cast') {
      fish.t += dt / CAST_TIME;
      if (fish.t >= 1) {
        const aimed = fish.aim && floaters.includes(fish.aim) ? fish.aim : null;
        const f = aimed || catchAt(fish.target);
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
    fish.maxP = Math.max(fish.maxP, fish.p);
    const e = easeOut(fish.p);
    f.z = fish.z0 + (Z_LANDED - fish.z0) * e;
    // 앞으로 끌려오면서 낚싯대 쪽으로 모인다 (화면 밖으로 퍼지지 않게)
    f.x = fish.x0 + (W * 0.56 - fish.x0) * e * 0.8;
    if (fish.p !== before) onProgress(fish.p);
    if (fish.p >= 1) {
      land();
      return;
    }
    // 당기다가 진행률이 0으로 돌아가면 줄이 풀리고 다시 흐름에 합류
    if (fish.maxP > 0.03 && fish.p === 0) {
      bubble(f.x, f.y - f.h * f.s - 12, '멀어졌어요', true);
      release();
      onEscape();
    }
  }

  function land() {
    const f = fish.f;
    fish.phase = 'landing';
    splash(f.x, Math.min(f.y, H) - 40, !!f.data.special);
    if (f.data.special) warmFlash();
    f.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, fill: 'forwards' });
    setTimeout(() => {
      remove(f);
      fish = null;
      onLanded(f);
    }, 380);
  }

  // 놓아주기: 다시 흐름에 합류 (깊이는 원래대로 천천히 돌아감)
  function release() {
    if (!fish || fish.phase === 'landing') return;
    if (fish.f) fish.f.held = false;
    fish = null;
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

  // 바다가 보낸 병을 건지면 화면 전체가 잠깐 따뜻하게 밝아진다
  function warmFlash() {
    const app = scene.closest('#app') || document.body;
    const el = document.createElement('div');
    el.className = 'warm-flash';
    app.appendChild(el);
    el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }],
      { duration: reducedMotion.matches ? 400 : 1100, easing: 'ease-out' }).onfinish = () => el.remove();
  }

  function splash(x, y, gold = false) {
    const flash = document.createElement('div');
    flash.className = 'ripple';
    flash.style.left = `${x}px`;
    flash.style.top = `${y}px`;
    effects.appendChild(flash);
    flash.animate(
      [{ transform: 'scale(2)', opacity: 1 }, { transform: 'scale(9)', opacity: 0 }],
      { duration: 600, easing: 'ease-out', fill: 'forwards' },
    ).onfinish = () => flash.remove();
    for (let i = 0; i < (gold ? 22 : 14); i++) {
      const d = document.createElement('div');
      d.className = gold ? 'drop gold' : 'drop';
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

    const flow = reducedMotion.matches ? 0.5 : 1; // 움직임 줄이기면 흐름 절반
    for (const f of floaters.slice()) {
      if (f.held) continue;
      f.x += FLOW_DIR * f.speed * flow * dt;
      // 끌려왔다 놓인 병은 원래 깊이로 천천히 돌아간다
      if (f.z !== f.homeZ) {
        f.z += (f.homeZ - f.z) * Math.min(1, dt * 2);
        if (Math.abs(f.z - f.homeZ) < 0.001) f.z = f.homeZ;
      }
      if (isDownstreamOut(f)) {
        // 바다가 보낸 병은 건질 때까지 다시 상류에서 들어온다
        if (f.data.special) f.x = upstreamX(f.s, f.w);
        else remove(f);
      }
    }

    spawnTimer -= dt;
    // 바다가 보낸 병은 바다가 가득 차 있어도 한 자리 더 비집고 들어온다
    const room = targetCount() + (nextSpecial() ? 1 : 0);
    if (floaters.length < room && spawnTimer <= 0) {
      spawn();
      // 비었을 땐 더 드물게
      spawnTimer = pool.length === 0 ? 6 + Math.random() * 6 : 1 + Math.random() * 1.6;
    }

    if (fish) updateFish(dt);
    for (const f of floaters) place(f);
    const t0 = shakeRod();
    if (fish && fish.phase !== 'landing') drawFishLine(t0);
    else drawIdleLine(t0);
    requestAnimationFrame(frame);
  }

  // 처음 열었을 때 화면이 비어 있지 않게 좌우로 고르게 채운다.
  function fillInitial() {
    const n = targetCount();
    for (let i = 0; i < n; i++) spawn(((i + 0.2 + Math.random() * 0.6) / n) * W);
    spawnTimer = 1.5;
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
    setSpecial,
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
