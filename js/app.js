// 화면 전환과 앱 상태.
import { createSea } from './sea.js';
import * as store from './store.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);

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

// ---------- 화면 전환 ----------
const SOON_TITLES = { write: '나도 병 띄우기', archive: '보관함', letter: '건진 병' };

const screens = {
  sea: document.getElementById('screen-sea'),
  soon: document.getElementById('screen-soon'),
};

function route() {
  const name = location.hash.replace('#', '') || 'sea';
  const target = screens[name] ? name : SOON_TITLES[name] ? 'soon' : 'sea';
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== target;
  if (target === 'soon') document.getElementById('soon-title').textContent = SOON_TITLES[name];
  if (target === 'sea') sea.start();
  else sea.stop();
}

// ---------- 바다 ----------
const emptyMsg = document.getElementById('sea-empty');

const sea = createSea(document.getElementById('scene'), {
  onTap(f) {
    // 낚시(바늘 던지기·끌어올리기)는 작업 순서 3단계에서 붙인다.
    f.el.animate(
      [{ filter: 'brightness(1)' }, { filter: 'brightness(1.25)' }, { filter: 'brightness(1)' }],
      { duration: 400 },
    );
  },
  onEmptyChange(empty) {
    emptyMsg.hidden = !empty;
  },
});

async function loadSea() {
  const list = params.has('empty') ? [] : await store.listSeaBottles();
  sea.setPool(list);
}

// ---------- 소리 버튼 (재생은 7단계 sound.js) ----------
const soundBtn = document.getElementById('sound-btn');

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
  const intro = document.getElementById('intro');
  if (store.load('bottle.seenIntro', false)) return;
  intro.hidden = false;
  const close = () => {
    intro.hidden = true;
    store.save('bottle.seenIntro', true);
  };
  intro.addEventListener('click', close);
}

// ---------- 시작 ----------
// 바다를 아래로 당겨 새로고침되는 것 막기
document.addEventListener('touchmove', (e) => {
  if (e.target.closest('.scene')) e.preventDefault();
}, { passive: false });

applyTime();
setInterval(applyTime, 60 * 1000);
makeStars();
renderSound(store.load('bottle.sound', true));
document.getElementById('demo-badge').hidden = store.mode !== 'demo';
setupIntro();
await loadSea();
window.addEventListener('hashchange', route);
route();
