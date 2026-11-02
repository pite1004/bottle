// 화면 전환과 앱 상태.
import { createSea } from './sea.js';
import { bottleSVG, trashSVG } from './bottle.js';
import * as store from './store.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const DAY = 24 * 60 * 60 * 1000;

// ---------- 시간대 하늘 ----------
// 06~17시 낮, 17~19시 노을, 19~06시 밤. 확인용으로 ?time=day|dusk|night 지원.
function timeOfDay(hour) {
  if (hour >= 6 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'night';
}

const THEME_COLOR = { day: '#dfe7ef', dusk: '#a7a2bd', night: '#1b1f26' };

function applyTime() {
  const forced = params.get('time');
  const t = THEME_COLOR[forced] ? forced : timeOfDay(new Date().getHours());
  if (app.dataset.time !== t) {
    app.dataset.time = t;
    document.querySelector('meta[name="theme-color"]').content = THEME_COLOR[t];
  }
}

function makeStars() {
  const box = document.querySelector('.stars');
  let html = '';
  for (let i = 0; i < 46; i++) {
    const size = Math.random() < 0.15 ? 3 : 2;
    html += `<span class="star" style="left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 88).toFixed(1)}%;width:${size}px;height:${size}px;animation-delay:${(Math.random() * 4).toFixed(2)}s"></span>`;
  }
  box.innerHTML = html;
}

// ---------- 알림 문구 ----------
let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

// ---------- 화면 전환 ----------
const SOON_TITLES = { write: '나도 병 띄우기', archive: '보관함' };

const screens = {
  sea: $('screen-sea'),
  letter: $('screen-letter'),
  found: $('screen-found'),
  soon: $('screen-soon'),
};

let currentLetter = null;
let currentFound = null;

function route() {
  const name = location.hash.replace('#', '').split('?')[0] || 'sea';
  let target = screens[name] && name !== 'soon' ? name : SOON_TITLES[name] ? 'soon' : 'sea';
  // 새로고침 등으로 보여 줄 내용이 없으면 바다로
  if ((target === 'letter' && !currentLetter) || (target === 'found' && !currentFound)) {
    history.replaceState(null, '', '#sea');
    target = 'sea';
  }
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== target;
  $('demo-badge').hidden = store.mode !== 'demo' || target !== 'sea';
  if (target === 'soon') $('soon-title').textContent = SOON_TITLES[name];
  if (target === 'sea') {
    sea.start();
  } else {
    if (sea.busy) releaseFish();
    sea.stop();
  }
  window.scrollTo(0, 0);
}

// ---------- 바다 · 낚시 ----------
const bottom = document.querySelector('.bottom');
const fishPanel = $('bottom-fish');
const holdBtn = $('hold-btn');
const reel = $('reel');

function showFishPanel(on) {
  bottom.classList.toggle('fishing', on);
  fishPanel.hidden = !on;
  if (!on) setHolding(false);
}

function renderProgress(p) {
  const pct = Math.round(p * 100);
  $('reel-fill').style.width = `${pct}%`;
  $('reel-text').textContent = `끌어올리는 중… ${pct}%`;
  reel.setAttribute('aria-valuenow', String(pct));
  reel.classList.toggle('idle', pct === 0);
}

function setHolding(on) {
  holdBtn.classList.toggle('holding', on);
  sea.hold(on);
}

function releaseFish() {
  sea.release();
  showFishPanel(false);
}

const sea = createSea($('scene'), {
  onTap() {
    holdBtn.disabled = true;
    renderProgress(0);
    showFishPanel(true);
  },
  onHook() {
    holdBtn.disabled = false;
  },
  onProgress: renderProgress,
  async onLanded(f) {
    showFishPanel(false);
    if (f.kind === 'bottle') {
      await store.catchBottle(f.data);
      showLetter(f.data);
      location.hash = 'letter';
      loadSea();
    } else {
      showFound(f.data.trash, store.addTrash(f.data.trash));
      location.hash = 'found';
    }
  },
  onEmptyChange(empty) {
    $('sea-empty').hidden = !empty;
  },
});

// 꾹 누르기: 손가락·마우스 (pointer 이벤트)
holdBtn.addEventListener('pointerdown', (e) => {
  if (holdBtn.disabled) return;
  e.preventDefault();
  holdBtn.setPointerCapture(e.pointerId);
  setHolding(true);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  holdBtn.addEventListener(type, () => setHolding(false));
}
holdBtn.addEventListener('contextmenu', (e) => e.preventDefault());

// 꾹 누르기: PC 스페이스바
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space' || !sea.busy || screens.sea.hidden) return;
  e.preventDefault();
  if (!e.repeat && !holdBtn.disabled) setHolding(true);
});
document.addEventListener('keyup', (e) => {
  if (e.code !== 'Space' || !sea.busy) return;
  e.preventDefault();
  setHolding(false);
});

$('release-btn').addEventListener('click', releaseFish);

async function loadSea() {
  const list = params.has('empty') ? [] : await store.listSeaBottles();
  sea.setPool(list);
}

// ---------- 04 건진 편지 ----------
const LAUNCH_TIME = { day: '낮에 띄워짐', dusk: '노을 질 때 띄워짐', night: '밤에 띄워짐' };

function letterMeta(createdAt) {
  const days = Math.floor((Date.now() - createdAt) / DAY);
  const drift = days >= 1 ? `${days}일 동안 떠다닌 병` : '오늘 바다에 나온 병';
  return `${drift} · ${LAUNCH_TIME[timeOfDay(new Date(createdAt).getHours())]}`;
}

function showLetter(b) {
  currentLetter = b;
  $('letter-bottle').innerHTML = bottleSVG(b);
  const text = $('letter-text');
  text.textContent = b.text;
  text.className = `letter-text font-${b.font}`;
  $('letter-meta').textContent = letterMeta(b.createdAt);
}

$('report-btn').addEventListener('click', async () => {
  if (!currentLetter) return;
  if (store.hasReported(currentLetter.id)) {
    toast('이미 신고한 병이에요');
    return;
  }
  if (!confirm('이 병을 신고할까요?\n신고가 쌓이면 바다에서 사라져요.')) return;
  await store.reportBottle(currentLetter.id);
  toast('신고했어요. 알려 줘서 고마워요');
});

$('save-card-btn').addEventListener('click', () => toast('카드 저장은 곧 열려요'));

// ---------- 04-b 쓰레기 ----------
const FOUND_TITLE = {
  pet: '병인 줄 알았는데 페트병이었어요',
  vinyl: '병인 줄 알았는데 비닐이었어요',
  can: '병인 줄 알았는데 녹슨 캔이었어요',
};

function showFound(kind, { total, unlocked }) {
  currentFound = kind;
  $('found-item').innerHTML = trashSVG(kind);
  $('found-title').textContent = FOUND_TITLE[kind];
  const shown = Math.min(total, store.TRASH_GOAL);
  $('collect-count').textContent = `${shown} / ${store.TRASH_GOAL}`;
  $('collect-fill').style.width = `${(shown / store.TRASH_GOAL) * 100}%`;
  const card = $('unlock-card');
  card.hidden = !unlocked;
  if (unlocked) {
    $('unlock-name').textContent = unlocked.name;
    $('unlock-bottle').innerHTML = bottleSVG({ [unlocked.part]: unlocked.value });
  }
}

// ---------- 소리 버튼 (재생은 7단계 sound.js) ----------
const soundBtn = $('sound-btn');

function renderSound(on) {
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.setAttribute('aria-label', on ? '바닷소리 끄기' : '바닷소리 켜기');
}

soundBtn.addEventListener('click', () => {
  const on = soundBtn.getAttribute('aria-pressed') !== 'true';
  store.save('bottle.sound', on);
  renderSound(on);
});

// ---------- 첫 방문 안내 ----------
function setupIntro() {
  const intro = $('intro');
  if (store.load('bottle.seenIntro', false)) return;
  intro.hidden = false;
  intro.addEventListener('click', () => {
    intro.hidden = true;
    store.save('bottle.seenIntro', true);
  });
}

// ---------- 시작 ----------
// 바다를 아래로 당겨 새로고침되는 것 막기
document.addEventListener('touchmove', (e) => {
  if (e.target.closest('.scene, .bottom-fish')) e.preventDefault();
}, { passive: false });

applyTime();
setInterval(applyTime, 60 * 1000);
makeStars();
renderSound(store.load('bottle.sound', true));
setupIntro();
await loadSea();
window.addEventListener('hashchange', route);
route();
