// 꿈꾸기 (#dream, 약 30초): 배 위에서 잠들어 2026년의 도시를 꿈꾸고, 물이 차오르며 다시 2100년으로 깨어난다.
// 인트로와 같은 3인칭 장면(배·사람·바다)을 쓴다.
import * as sound from './sound.js';

// 문장은 여기서 고치면 돼요. part: past(꿈속 2026년) / rise(물이 차오름) / wake(깨어남) / after(1인칭 바다로 돌아온 뒤)
// time: 그 문장이 머무는 시간(ms). 없으면 3초
export const LINES = [
  { part: 'past', text: '꿈을 꿨어요.' },
  { part: 'past', text: '바다가 아직 저 아래에 있던 날.' },
  { part: 'past', text: '매일 지나던 거리, 나무 그늘, 시끄럽던 매미 소리.' },
  { part: 'past', text: '그땐 그게 당연한 줄 알았어요.' },
  { part: 'rise', text: '텀블러 하나, 꺼두지 않은 불 하나.' },
  { part: 'rise', text: '별것 아니라고 미뤄뒀던 작은 일들.' },
  { part: 'rise', text: '한 번만 더 해볼걸.' },
  { part: 'rise', text: '그랬다면 이 바다는, 조금 덜 차올랐을까요?', time: 4000 },
  { part: 'wake', text: '다시, 2100년.' },
  { part: 'after', text: '하지만 당신은, 아직 그날에 살고 있어요.', time: 4500 },
];

const LINE_TIME = 3000;
const SLEEP_TIME = 3000; // 잠들기
const WAKE_TIME = 4100;  // 깨어남 (확대 전환 전까지, "다시, 2100년."은 약 2.9초)
const ZOOM_TIME = 1500;

// 수면 높이(화면 위에서부터 %). 42 = 지금(2100년)의 해수면, 100 = 화면 아래로 다 빠짐
const SEA_NOW = 42;
const RISE_STEPS = [84, 70, 56, 44]; // 아쉬움 문장마다 조금씩 차오른다
// 화면 전체에 씌우는 색. 밤 → 따뜻한 햇살 → 점점 차가운 톤
const TINT = {
  night: 'rgba(14, 20, 38, .5)',
  past: 'rgba(255, 186, 110, .1)',
  rise: ['rgba(214, 196, 168, .16)', 'rgba(140, 160, 180, .24)', 'rgba(80, 112, 146, .34)', 'rgba(42, 72, 108, .44)'],
};

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const $ = (id) => document.getElementById(id);

export function createDream({ app, onSleep = () => {}, onWake = () => {}, onComplete = () => {}, onSkip = () => {}, onDone = () => {} }) {
  const root = $('dream');
  const stage = $('dream-stage');
  const shade = $('dream-shade');
  const world = $('dream-world');
  const water = $('dream-water');
  const skyDay = $('dream-sky-day');
  const tint = $('dream-tint');
  const flash = $('dream-flash');
  const boat = $('dream-boat');
  const textBox = $('dream-text');
  const lineEl = $('dream-line');
  const skipBtn = $('dream-skip');
  const topbar = app.querySelector('#screen-sea .topbar');
  const rod = app.querySelector('.rod');
  const scene = $('scene');

  drawTown($('dream-town'));

  let state = 'idle'; // idle | sleep | past | rise | wake | zoom | after
  let index = -1;
  let timers = [];

  const rm = () => reducedMotion.matches;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  function setWater(top, seconds = 0) {
    water.style.transitionDuration = `${seconds}s`;
    water.style.transform = `translateY(${top}%)`;
  }

  function setLook({ day, tintColor, boatOn, seconds = 0 }) {
    for (const el of [skyDay, tint, boat]) el.style.transitionDuration = `${seconds}s`;
    if (day != null) skyDay.style.opacity = day;
    if (tintColor) tint.style.backgroundColor = tintColor;
    if (boatOn != null) boat.style.opacity = boatOn ? 1 : 0;
  }

  // 움직임 줄이기: 확대·수면 이동 없이 장면을 크로스페이드로 바꾼다
  function crossfade(apply) {
    world.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).onfinish = () => {
      apply();
      world.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'forwards' });
    };
  }

  function say(text, centered = false) {
    root.classList.toggle('centered', centered);
    lineEl.textContent = text;
    lineEl.animate(
      [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
      { duration: rm() ? 200 : 800, easing: 'ease-out', fill: 'both' },
    );
  }

  function hush(ms = 400) {
    lineEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, fill: 'forwards' });
  }

  function reset() {
    for (const el of [root, stage, shade, world, lineEl, textBox, skipBtn, flash, scene, topbar, rod]) {
      el.getAnimations().forEach((a) => a.cancel());
    }
    root.classList.remove('after', 'centered');
    boat.classList.remove('lying');
    lineEl.textContent = '';
    flash.style.opacity = 0;
    setWater(SEA_NOW);
    setLook({ day: 0, tintColor: TINT.night, boatOn: true });
    index = -1;
  }

  // 1) 잠들기: 1인칭 바다가 어두워지며 뒤로 빠지고, 인트로 확대의 역재생처럼 3인칭 밤바다로
  function play() {
    if (state !== 'idle') return;
    clearTimers();
    reset();
    state = 'sleep';
    root.hidden = false;
    app.classList.add('dream-on');
    skipBtn.focus({ preventScroll: true });
    sound.dreamScene('sleep');

    if (rm()) {
      boat.classList.add('lying');
      stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: 'backwards' });
    } else {
      const rect = root.getBoundingClientRect();
      const b = boat.getBoundingClientRect();
      world.style.transformOrigin = `${b.left + b.width * 0.52 - rect.left}px ${b.top + b.height * 0.3 - rect.top}px`;
      shade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 1400, easing: 'ease-in', fill: 'backwards' });
      scene.animate(
        [{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(.86)', filter: 'brightness(.45)' }],
        { duration: 1400, easing: 'ease-in', fill: 'forwards' },
      );
      world.animate(
        [
          { transform: 'scale(3.4)', filter: 'blur(10px)', opacity: 0 },
          { transform: 'scale(1)', filter: 'blur(0)', opacity: 1 },
        ],
        { duration: 1700, delay: 700, easing: 'cubic-bezier(.3,.6,.5,1)', fill: 'backwards' },
      );
      later(() => boat.classList.add('lying'), 1900);
    }
    later(() => {
      scene.getAnimations().forEach((a) => a.cancel());
      onSleep();
    }, 2500);
    later(startPast, SLEEP_TIME);
  }

  // 2) 꿈속 2026년: 해수면이 화면 아래로 내려가며 잠겨 있던 거리가 드러나고, 따뜻한 햇살 톤으로
  function startPast() {
    clearTimers();
    state = 'past';
    sound.dreamScene('past');
    const apply = (s) => {
      setWater(100, s * 1.15);
      setLook({ day: 1, tintColor: TINT.past, boatOn: false, seconds: s });
    };
    if (rm()) {
      crossfade(() => apply(0));
    } else {
      world.animate(
        [{ filter: 'blur(0)' }, { filter: 'blur(6px)', offset: 0.35 }, { filter: 'blur(0)' }],
        { duration: 2400, easing: 'ease-in-out' },
      );
      apply(2.4);
    }
    later(() => showLine(0), rm() ? 700 : 1000);
  }

  function showLine(n) {
    clearTimers();
    const line = LINES[n];
    if (!line || line.part === 'wake' || line.part === 'after') return wake();
    index = n;
    if (line.part === 'rise') rise(n - LINES.findIndex((l) => l.part === 'rise'));
    say(line.text);
    later(() => showLine(n + 1), line.time || LINE_TIME);
  }

  // 3) 아쉬움: 수면이 조용히 차오르고, 색이 다시 차가워지고, 새소리 대신 바닷소리가 돌아온다
  function rise(k) {
    const count = LINES.filter((l) => l.part === 'rise').length;
    if (state !== 'rise') {
      state = 'rise';
      if (rm()) crossfade(() => setWater(RISE_STEPS[RISE_STEPS.length - 1]));
    }
    if (!rm()) setWater(RISE_STEPS[Math.min(k, RISE_STEPS.length - 1)], 2.4);
    setLook({ tintColor: TINT.rise[Math.min(k, TINT.rise.length - 1)], seconds: 2.4 });
    sound.dreamScene('rise', (k + 1) / count);
  }

  // 4) 깨어남: 물이 화면을 다 덮는 순간 푸르스름하게 하얗게 번지고, 3인칭 밤바다에서 사람이 일어나 앉는다
  function wake() {
    clearTimers();
    state = 'wake';
    hush();
    const wakeLine = LINES.find((l) => l.part === 'wake');
    if (!rm()) setWater(0, 0.9);
    later(() => {
      flash.animate([{ opacity: 0 }, { opacity: 1 }], { duration: rm() ? 400 : 500, easing: 'ease-in', fill: 'forwards' });
    }, rm() ? 0 : 600);
    later(() => {
      setWater(SEA_NOW);
      setLook({ day: 0, tintColor: TINT.night, boatOn: true });
      boat.classList.add('lying');
      sound.dreamScene('wake');
      flash.getAnimations().forEach((a) => a.cancel());
      flash.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 800, easing: 'ease-out', fill: 'forwards' });
      if (wakeLine) say(wakeLine.text, true);
    }, 1200);
    later(() => boat.classList.remove('lying'), 1700);
    later(zoomOut, WAKE_TIME);
  }

  // 인트로 끝과 같은 확대 전환으로 1인칭 바다에 돌아온다 (낚싯대 슬라이드 인, 상단 바 페이드인)
  function zoomOut() {
    clearTimers();
    state = 'zoom';
    const zoom = !rm();
    const dur = zoom ? ZOOM_TIME : 500;
    onWake();
    app.classList.remove('dream-on');
    hush(350);
    skipBtn.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, fill: 'forwards' });

    if (zoom) {
      const rect = root.getBoundingClientRect();
      const b = boat.getBoundingClientRect();
      world.getAnimations().forEach((a) => a.cancel());
      world.style.transformOrigin = `${b.left + b.width * 0.52 - rect.left}px ${b.top + b.height * 0.3 - rect.top}px`;
      world.animate(
        [
          { transform: 'scale(1)', filter: 'blur(0)', opacity: 1 },
          { transform: 'scale(3.4)', filter: 'blur(10px)', opacity: 0 },
        ],
        { duration: dur, easing: 'cubic-bezier(.5,0,.7,.4)', fill: 'forwards' },
      );
      rod.animate(
        [{ transform: 'translate(140px, 200px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 1000, delay: 500, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' },
      );
      topbar.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 1300, fill: 'backwards' });
    } else {
      for (const el of [rod, topbar]) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, fill: 'backwards' });
    }
    stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, easing: 'ease-in', fill: 'forwards' }).onfinish = after;
  }

  // 5) 1인칭 바다 위 가운데에 마지막 한 줄, 사라지면 평소 바다로
  function after() {
    if (state !== 'zoom') return;
    state = 'after';
    root.classList.add('after');
    onComplete();
    const line = LINES.find((l) => l.part === 'after');
    if (!line) return finish();
    say(line.text, true);
    later(() => {
      lineEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 700, fill: 'forwards' }).onfinish = finish;
    }, line.time || 4500);
  }

  function finish() {
    clearTimers();
    reset();
    root.hidden = true;
    state = 'idle';
    onDone();
  }

  // 건너뛰기 (또는 뒤로 가기): 0.5초 크로스페이드로 바다로
  function skip() {
    if (state === 'idle' || state === 'zoom' || state === 'after') return;
    clearTimers();
    onSkip(Math.max(0, index + 1)); // 건너뛴 시점의 문장 번호 (1부터, 잠들기 중이면 0)
    state = 'zoom';
    sound.dreamScene('wake');
    onWake();
    app.classList.remove('dream-on');
    scene.getAnimations().forEach((a) => a.cancel());
    for (const el of [rod, topbar]) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: 'backwards' });
    root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' }).onfinish = finish;
  }

  // 화면 탭: 다음 문장으로
  function next() {
    if (state === 'sleep') startPast();
    else if (state === 'past' || state === 'rise') {
      if (index >= 0) showLine(index + 1);
    } else if (state === 'wake') zoomOut();
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    next();
  });
  skipBtn.addEventListener('click', skip);

  return {
    play,
    skip,
    get playing() { return state !== 'idle'; },
    // 꿈 장면이 화면을 덮고 있는 동안 (마지막 한 줄은 바다 위에 떠 있을 뿐이라 제외)
    get covering() { return state !== 'idle' && state !== 'after'; },
  };
}

// 꿈속 2026년의 거리: 창문 있는 건물·아파트, 가로수, 버스 정류장, 지나가는 버스, 걷는 사람, 나는 새
// viewBox 0 0 400 700, 수평선(42%)은 y = 294. 뒤쪽 건물 꼭대기 몇 개는 수평선 위로 나와서 밤바다에선 "잠긴 도시"로 보인다
function drawTown(svg) {
  let s = 2026;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  let out = '';

  const windows = (x, y, w, h, gap, size, lit) => {
    let r = '';
    for (let wy = y + gap; wy + size <= y + h - gap; wy += gap + size) {
      for (let wx = x + gap; wx + size <= x + w - gap + 0.1; wx += gap + size) {
        r += `<rect x="${wx.toFixed(1)}" y="${wy.toFixed(1)}" width="${size}" height="${size}" fill="${rnd() < lit ? '#ffe9c4' : '#a9bccb'}"/>`;
      }
    }
    return r;
  };

  // 뒤쪽 건물 (흐릿하게, 꼭대기가 높다)
  let x = -10;
  while (x < 410) {
    const w = 28 + rnd() * 26;
    const top = 236 + rnd() * 96;
    out += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${(590 - top).toFixed(1)}" fill="${rnd() > 0.5 ? '#d9b8a0' : '#cfae98'}"/>`;
    out += windows(x, top, w, 590 - top, 5, 4, 0.35);
    if (rnd() > 0.65) out += `<rect x="${(x + w / 2 - 0.7).toFixed(1)}" y="${(top - 10).toFixed(1)}" width="1.4" height="10" fill="#b99a86"/>`;
    x += w + 2 + rnd() * 8;
  }

  // 앞쪽 아파트
  x = -6;
  while (x < 410) {
    const w = 52 + rnd() * 30;
    const top = 350 + rnd() * 80;
    const color = ['#c48b6c', '#b97f66', '#d39a76', '#a9806f'][Math.floor(rnd() * 4)];
    out += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${w.toFixed(1)}" height="${(592 - top).toFixed(1)}" fill="${color}"/>`;
    out += `<rect x="${(x - 2).toFixed(1)}" y="${top.toFixed(1)}" width="${(w + 4).toFixed(1)}" height="4" fill="#8f6656"/>`;
    out += windows(x, top + 4, w, 588 - top, 6, 7, 0.45);
    x += w + 6 + rnd() * 10;
  }

  // 건너편 인도와 가로수
  out += '<rect x="-20" y="588" width="440" height="16" fill="#dcc6aa"/>';
  for (let tx = 14; tx < 410; tx += 56 + rnd() * 14) {
    const r = 13 + rnd() * 5;
    out += `<rect x="${(tx - 1.6).toFixed(1)}" y="${(592 - r).toFixed(1)}" width="3.2" height="${(r + 8).toFixed(1)}" fill="#6b4f3c"/>`;
    out += `<circle cx="${tx.toFixed(1)}" cy="${(586 - r).toFixed(1)}" r="${r.toFixed(1)}" fill="${rnd() > 0.5 ? '#7aa063' : '#6b9356'}"/>`;
    out += `<circle cx="${(tx + r * 0.55).toFixed(1)}" cy="${(590 - r * 0.6).toFixed(1)}" r="${(r * 0.7).toFixed(1)}" fill="#86ab6c"/>`;
  }

  // 도로
  out += '<rect x="-20" y="604" width="440" height="50" fill="#77716f"/>';
  for (let dx = -10; dx < 410; dx += 34) out += `<rect x="${dx}" y="627" width="18" height="3" fill="#efe6d6"/>`;

  // 버스 (왼쪽에서 오른쪽으로 천천히)
  out += `<g class="dream-bus"><g transform="translate(0 600)">
    <rect x="0" y="0" width="112" height="36" rx="7" fill="#5c9e6c"/>
    <rect x="0" y="24" width="112" height="5" fill="#3f7a52"/>
    ${[8, 30, 52, 74].map((wx) => `<rect x="${wx}" y="6" width="18" height="13" rx="2" fill="#d8ecf2"/>`).join('')}
    <rect x="96" y="6" width="12" height="20" rx="2" fill="#d8ecf2"/>
    <circle cx="22" cy="36" r="6" fill="#2f2a2b"/><circle cx="90" cy="36" r="6" fill="#2f2a2b"/>
  </g></g>`;

  // 이쪽 인도 + 버스 정류장
  out += '<rect x="-20" y="654" width="440" height="50" fill="#e6d4bb"/>';
  out += `<g>
    <rect x="268" y="650" width="62" height="34" fill="#a8cbd5" opacity=".75"/>
    <rect x="262" y="643" width="74" height="7" rx="2" fill="#4f6d7a"/>
    <rect x="265" y="650" width="3" height="42" fill="#4f6d7a"/><rect x="330" y="650" width="3" height="42" fill="#4f6d7a"/>
    <rect x="276" y="676" width="46" height="4" fill="#8a6a55"/>
    <rect x="348" y="640" width="2.4" height="52" fill="#4f6d7a"/>
    <circle cx="349.2" cy="641" r="7" fill="#3d7fb0"/><rect x="346" y="639.6" width="6.4" height="2.8" fill="#fff"/>
  </g>`;

  // 걷는 사람들
  const walker = (cls, flip) => `<g class="dream-walker ${cls}"><g${flip ? ' transform="scale(-1 1)"' : ''}><g class="dream-step">
    <circle cx="0" cy="-22" r="3.4" fill="#4b3f45"/>
    <path d="M-3.4 -17.5 Q0 -19.5 3.4 -17.5 L3 -7 L-3 -7 Z" fill="#4b3f45"/>
    <path d="M-2.6 -7.5 L-4 0 M2.6 -7.5 L4 0" stroke="#4b3f45" stroke-width="2.2" stroke-linecap="round"/>
  </g></g></g>`;
  out += walker('w1', false) + walker('w2', true) + walker('w3', false);

  // 하늘을 나는 새
  const bird = (cls) => `<g class="dream-bird ${cls}"><path class="dream-wing" d="M-7 0 Q-3.5 -5 0 0 Q3.5 -5 7 0" fill="none" stroke="#6a5552" stroke-width="1.5" stroke-linecap="round"/></g>`;
  out += bird('b1') + bird('b2') + bird('b3');

  svg.setAttribute('viewBox', '0 0 400 700');
  svg.innerHTML = out;
}
