// 00 인트로: 노을 진 바다 위 작은 배. 문장이 한 줄씩 나오고, "이야기 들어보기"를 누르면 1인칭 바다로 들어간다.
import { bottleSVG } from './bottle.js';

const LINES = [
  '2100년.',
  '빙하가 모두 녹고, 도시는 바다 아래로 잠겼어요.',
  '당신은 작은 배 위에서 홀로 표류하고 있어요.',
  '어디서 왔는지 모를 병들이 끝없이 떠내려와요.',
  '병 안에는 누군가의 이야기가 들어 있어요.',
  '누군지도 모르는 그들은 당신을 위해 무슨 이야기를 써 내려갔을까요?',
];
const LINE_TIME = 2500;      // 줄당 머무는 시간 (5줄 × 2.5초 = 12.5초)
const LAST_LINE_TIME = 3000; // 마지막 줄은 조금 더 (시작 지연 0.5초 포함, 버튼은 16초 안에 나타난다)
const DRIFT_FROM = 2;        // 3번 문장부터 병이 떠내려온다 (0부터 셈)
const SETTLE_AT = 4;         // 5번 문장에서 하나가 배 옆에 멈춘다

// 병: 시작 위치 → 떠내려온 위치 → (5번 문장 이후) 계속 흘러가는 위치. 화면 비율(0~1)
// 1인칭 바다와 같은 해류 방향(왼쪽 → 오른쪽)으로 흘러온다
const BOTTLES = [
  { look: { shape: 'wine', color: 'amber', cork: 'cork', inside: 'none' }, from: [-0.12, 0.6], to: [0.3, 0.63] },
  { look: { shape: 'milk', color: 'clear', cork: 'ribbon', inside: 'shell' }, from: [-0.16, 0.52], to: [0.56, 0.52], next: [1.15, 0.5] },
  { look: { shape: 'vial', color: 'green', cork: 'wax', inside: 'flower' }, from: [-0.22, 0.8], to: [0.42, 0.82], next: [1.15, 0.86] },
  { look: { shape: 'jam', color: 'sky', cork: 'cork', inside: 'none' }, from: [-0.1, 0.88], to: [0.72, 0.86], next: [1.15, 0.9] },
];

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const $ = (id) => document.getElementById(id);

export function createStory({ app, onStart = () => {}, onDone = () => {} }) {
  const story = $('story');
  const world = $('story-world');
  const lineEl = $('story-line');
  const startBtn = $('story-start');
  const skipBtn = $('story-skip');
  const bottlesBox = $('story-bottles');
  const topbar = app.querySelector('.topbar');
  const rod = app.querySelector('.rod');

  let index = -1;
  let timer = 0;
  let done = true;
  let bottleEls = [];

  drawCity($('story-city'));

  function place(el, [fx, fy]) {
    el.style.left = `${fx * 100}%`;
    el.style.top = `${fy * 100}%`;
  }

  function makeBottles() {
    bottlesBox.innerHTML = '';
    bottleEls = BOTTLES.map((b, i) => {
      const el = document.createElement('div');
      el.className = 'story-bottle';
      // 멀수록(위쪽일수록) 작게
      const size = 0.55 + ((b.to[1] - 0.42) / 0.58) * 0.9;
      el.style.width = `${20 * size}px`;
      el.style.height = `${40 * size}px`;
      el.style.marginLeft = `${-10 * size}px`;
      el.style.marginTop = `${-40 * size}px`;
      el.innerHTML = `<div style="animation-delay:${-i * 0.9}s">${bottleSVG(b.look)}</div>`;
      el.style.transitionDuration = '0s';
      place(el, b.from);
      bottlesBox.appendChild(el);
      return el;
    });
  }

  function drift() {
    bottleEls.forEach((el, i) => {
      el.style.transitionDuration = `${6 + i * 0.8}s`;
      place(el, BOTTLES[i].to);
    });
  }

  // 하나는 배 옆에 멈추고, 나머지는 계속 흘러간다
  function settle() {
    const rect = story.getBoundingClientRect();
    // 흘러오다 배의 상류 쪽(왼쪽)에 걸려 멈춘다
    const boatSide = [0.5 - 70 / rect.width, 0.62 + 2 / rect.height];
    bottleEls.forEach((el, i) => {
      if (i === 0) {
        el.style.transitionDuration = '2.4s';
        el.style.transitionTimingFunction = 'cubic-bezier(.2,.6,.3,1)';
        place(el, boatSide);
      } else {
        el.style.transitionDuration = `${10 + i}s`;
        place(el, BOTTLES[i].next);
      }
    });
  }

  function showLine(n) {
    index = n;
    clearTimeout(timer);
    if (n === DRIFT_FROM) drift();
    if (n === SETTLE_AT) settle();
    lineEl.classList.toggle('first', n === 0);
    lineEl.textContent = LINES[n];
    lineEl.animate(
      [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
      { duration: reducedMotion.matches ? 200 : 700, easing: 'ease-out', fill: 'both' },
    );
    if (n < LINES.length - 1) timer = setTimeout(() => showLine(n + 1), LINE_TIME);
    else timer = setTimeout(showButton, LAST_LINE_TIME);
  }

  function showButton() {
    clearTimeout(timer);
    if (!startBtn.hidden) return;
    startBtn.hidden = false;
    $('story-privacy').hidden = false;
    startBtn.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 500, easing: 'ease-out' });
    startBtn.focus({ preventScroll: true });
  }

  // 화면 탭: 다음 줄로
  function next() {
    if (done || !startBtn.hidden) return;
    if (index < LINES.length - 1) showLine(index + 1);
    else showButton();
  }

  story.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    next();
  });

  function play() {
    clearTimeout(timer);
    done = false;
    index = -1;
    startBtn.hidden = true;
    $('story-privacy').hidden = true;
    lineEl.textContent = '';
    for (const el of [story, world, lineEl, skipBtn, startBtn, topbar, rod]) {
      el.getAnimations().forEach((a) => a.cancel());
    }
    makeBottles();
    app.classList.add('story-on');
    story.hidden = false;
    skipBtn.focus({ preventScroll: true });
    timer = setTimeout(() => showLine(0), 500);
  }

  // 1인칭 바다로 들어가기. full: 배에 탄 사람을 중심으로 확대되며 흐려진다 / 아니면 0.5초 크로스페이드
  function finish(full) {
    if (done) return;
    done = true;
    clearTimeout(timer);
    onStart(full); // 버튼을 누른 이 순간을 소리 시작 제스처로 쓴다 (full: 이야기 들어보기, 아니면 건너뛰기)

    const zoom = full && !reducedMotion.matches;
    const dur = zoom ? 1500 : 500;
    app.classList.remove('story-on');

    if (zoom) {
      const rect = story.getBoundingClientRect();
      const boat = $('story-boat').getBoundingClientRect();
      const ox = boat.left + boat.width * 0.52 - rect.left;
      const oy = boat.top + boat.height * 0.3 - rect.top; // 사람 머리·몸 쪽
      world.style.transformOrigin = `${ox}px ${oy}px`;
      world.animate(
        [
          { transform: 'scale(1)', filter: 'blur(0)', opacity: 1 },
          { transform: 'scale(3.4)', filter: 'blur(10px)', opacity: 0 },
        ],
        { duration: dur, easing: 'cubic-bezier(.5,0,.7,.4)', fill: 'forwards' },
      );
      for (const el of [lineEl.parentElement, skipBtn]) {
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, fill: 'forwards' });
      }
      rod.animate(
        [{ transform: 'translate(140px, 200px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 1000, delay: 500, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' },
      );
      topbar.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, delay: 1300, fill: 'backwards' });
    } else {
      for (const el of [rod, topbar]) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur, fill: 'backwards' });
      }
    }

    story.animate([{ opacity: 1 }, { opacity: 0 }], { duration: dur, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
      story.hidden = true;
      for (const el of [story, world, lineEl.parentElement, skipBtn]) {
        el.getAnimations().forEach((a) => a.cancel());
      }
      onDone();
    };
  }

  startBtn.addEventListener('click', () => finish(true));
  skipBtn.addEventListener('click', () => finish(false));

  return {
    play,
    get playing() { return !done; },
  };
}

// 수평선 위로 꼭대기만 보이는 잠긴 도시 (바다 화면과 같은 모양)
export function drawCity(svg) {
  let s = 2100;
  const rnd = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  let x = 0, parts = '';
  while (x < 400) {
    const w = 10 + rnd() * 22;
    const h = 6 + rnd() * 26;
    if (rnd() > 0.18) {
      parts += `<rect x="${x.toFixed(1)}" y="${(40 - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/>`;
      if (rnd() > 0.6) parts += `<rect x="${(x + w / 2 - 0.6).toFixed(1)}" y="${(40 - h - 7).toFixed(1)}" width="1.2" height="7"/>`;
      // 바다 화면은 여기서 창문 자리를 뽑는다. 같은 도시 모양이 나오게 난수 순서를 맞춘다.
      if (rnd() > 0.55) {
        rnd();
        rnd();
      }
    }
    x += w + rnd() * 6;
  }
  svg.setAttribute('viewBox', '0 0 400 40');
  svg.innerHTML = parts;
}
