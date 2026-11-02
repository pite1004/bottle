// 화면 전환과 앱 상태.
import { createSea } from './sea.js';
import { bottleSVG, trashSVG, TRASH_NAMES, OPTIONS, DEFAULT_LOOK, optionLabel } from './bottle.js';
import { checkText } from './moderation.js';
import { renderCard, shareOrSave } from './card.js';
import { createStory } from './intro.js';
import * as sound from './sound.js';
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
const SOON_TITLES = {};

const screens = {
  sea: $('screen-sea'),
  letter: $('screen-letter'),
  found: $('screen-found'),
  write: $('screen-write'),
  decorate: $('screen-decorate'),
  sent: $('screen-sent'),
  archive: $('screen-archive'),
  soon: $('screen-soon'),
};

let currentLetter = null;
let currentFound = null;
let seaReady = false;
let draftReady = false; // 검사를 통과한 글귀가 있어야 꾸미기로 갈 수 있다
let lastSent = null;

function route() {
  const name = location.hash.replace('#', '').split('?')[0] || 'sea';
  let target = screens[name] && name !== 'soon' ? name : SOON_TITLES[name] ? 'soon' : 'sea';
  // 새로고침 등으로 보여 줄 내용이 없으면 바다로
  if ((target === 'letter' && !currentLetter) || (target === 'found' && !currentFound)
    || (target === 'sent' && !lastSent)) {
    history.replaceState(null, '', '#sea');
    target = 'sea';
  }
  if (target === 'decorate' && !draftReady) {
    history.replaceState(null, '', '#write');
    target = 'write';
  }
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== target;
  $('demo-badge').hidden = store.mode !== 'demo' || target !== 'sea';
  if (target === 'soon') $('soon-title').textContent = SOON_TITLES[name];
  if (target === 'decorate') renderDecorate();
  if (target === 'sent') playSent();
  if (target === 'archive') {
    const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab');
    renderArchive(ARCHIVE_TABS.includes(tab) ? tab : 'caught');
  }
  if (target === 'sea') {
    if (seaReady) sea.start(); // 첫 병 목록을 받기 전엔 시작하지 않는다 (빈 바다 문구가 잠깐 뜨지 않게)
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
  onHook() {
    holdBtn.disabled = false;
    renderProgress(0);
    showFishPanel(true);
  },
  onProgress: renderProgress,
  async onLanded(f) {
    showFishPanel(false);
    if (f.kind === 'bottle') {
      // 건진 횟수 기록이 실패해도 편지는 보여 준다
      store.catchBottle(f.data).catch((err) => console.error(err));
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
  try {
    const list = params.has('empty') ? [] : await store.listSeaBottles();
    sea.setPool(list);
  } catch (err) {
    console.error(err);
    toast('바다에 연결하지 못했어요. 잠시 뒤 다시 열어 주세요');
  }
}

// ---------- 04 건진 편지 ----------
const LAUNCH_TIME = { day: '낮에 띄워짐', dusk: '노을 질 때 띄워짐', night: '밤에 띄워짐' };

function letterMeta(createdAt) {
  const days = Math.floor((Date.now() - createdAt) / DAY);
  const drift = days >= 1 ? `${days}일 동안 떠다닌 병` : '오늘 바다에 나온 병';
  return `${drift} · ${LAUNCH_TIME[timeOfDay(new Date(createdAt).getHours())]}`;
}

// from: 'sea'(방금 건짐) 또는 'archive'(보관함에서 다시 보기) — 뒤로 가기 위치
function showLetter(b, from = 'sea') {
  currentLetter = b;
  const back = $('letter-back');
  back.href = from === 'archive' ? '#archive' : '#sea';
  back.setAttribute('aria-label', from === 'archive' ? '보관함으로 돌아가기' : '바다로 돌아가기');
  $('letter-bottle').innerHTML = bottleSVG(b);
  const text = $('letter-text');
  text.textContent = b.text;
  text.className = `letter-text font-${b.font}`;
  $('letter-meta').textContent = letterMeta(b.createdAt);
  prepareCard(b);
}

$('report-btn').addEventListener('click', async () => {
  if (!currentLetter) return;
  if (store.hasReported(currentLetter.id)) {
    toast('이미 신고한 병이에요');
    return;
  }
  if (!confirm('이 병을 신고할까요?\n신고가 쌓이면 바다에서 사라져요.')) return;
  try {
    await store.reportBottle(currentLetter.id);
    toast('신고했어요. 알려 줘서 고마워요');
  } catch (err) {
    console.error(err);
    toast('신고하지 못했어요. 잠시 뒤 다시 해 주세요');
  }
});

// ---------- 공유 카드 ----------
// 아이폰은 버튼을 누른 직후에만 공유 시트를 열 수 있어서, 화면을 열 때 미리 그려 둔다.
let cardPromise = null;

function prepareCard(b) {
  cardPromise = renderCard(b, app.dataset.time);
  cardPromise.catch((err) => console.error(err));
}

async function deliverCard(how) {
  if (!cardPromise) return;
  try {
    const blob = await cardPromise;
    const result = await shareOrSave(blob, how);
    if (result === 'saved') {
      toast(/Android/i.test(navigator.userAgent)
        ? '저장했어요. 갤러리의 Download 앨범에서 볼 수 있어요'
        : '카드 이미지를 저장했어요');
    }
  } catch (err) {
    console.error(err);
    toast('카드를 만들지 못했어요. 다시 해 주세요');
  }
}

$('save-card-btn').addEventListener('click', () => deliverCard('save'));

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

// ---------- 05 글귀 쓰기 ----------
const savedDraft = store.load('bottle.draft', {});
const draft = {
  text: typeof savedDraft.text === 'string' ? savedDraft.text : '',
  font: ['pen', 'round', 'mono'].includes(savedDraft.font) ? savedDraft.font : 'pen',
  ...DEFAULT_LOOK,
};

const writeText = $('write-text');
const writeError = $('write-error');

function renderWrite() {
  writeText.value = draft.text;
  writeText.className = `font-${draft.font}`;
  $('write-count').textContent = String(draft.text.length);
  for (const b of document.querySelectorAll('.font-option')) {
    b.setAttribute('aria-pressed', String(b.dataset.font === draft.font));
  }
}

function saveDraft() {
  store.save('bottle.draft', { text: draft.text, font: draft.font });
}

writeText.addEventListener('input', () => {
  draft.text = writeText.value;
  draftReady = false;
  $('write-count').textContent = String(draft.text.length);
  writeError.hidden = true;
  $('crisis').hidden = true;
  saveDraft();
});

$('crisis-rewrite').addEventListener('click', () => {
  $('crisis').hidden = true;
  writeText.focus();
});

$('font-options').addEventListener('click', (e) => {
  const b = e.target.closest('.font-option');
  if (!b) return;
  draft.font = b.dataset.font;
  saveDraft();
  renderWrite();
});

$('write-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const result = checkText(draft.text);
  $('crisis').hidden = !result.crisis;
  if (result.crisis) {
    writeError.hidden = true;
    return;
  }
  if (!result.ok) {
    writeError.textContent = result.reason;
    writeError.hidden = false;
    return;
  }
  draft.text = result.text;
  draftReady = true;
  location.hash = 'decorate';
});

// ---------- 06 병 꾸미기 ----------
let decoPart = 'shape';

function look() {
  return { shape: draft.shape, color: draft.color, cork: draft.cork, inside: draft.inside };
}

function renderDecorate() {
  $('deco-preview').innerHTML = bottleSVG(look());
  const insideLabel = draft.inside === 'none' ? '넣을 것 없음' : optionLabel('inside', draft.inside);
  $('deco-summary').textContent = [
    optionLabel('shape', draft.shape),
    optionLabel('color', draft.color),
    optionLabel('cork', draft.cork),
    insideLabel,
  ].join(' · ');

  for (const t of document.querySelectorAll('#screen-decorate .tab')) {
    t.setAttribute('aria-selected', String(t.dataset.part === decoPart));
  }

  const unlocked = store.unlockedValues();
  $('deco-grid').innerHTML = OPTIONS[decoPart].map((o) => {
    const locked = o.locked && !unlocked.has(o.value);
    const picked = draft[decoPart] === o.value;
    return `<button type="button" class="deco-option" data-value="${o.value}" aria-pressed="${picked}" ${locked ? 'disabled' : ''}>
      ${bottleSVG({ ...look(), [decoPart]: o.value })}
      <span>${o.label}${locked ? '<small>수집품으로 해금</small>' : ''}</span>
    </button>`;
  }).join('');
}

document.querySelector('#screen-decorate .tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;
  decoPart = t.dataset.part;
  renderDecorate();
});

$('deco-grid').addEventListener('click', (e) => {
  const b = e.target.closest('.deco-option');
  if (!b || b.disabled) return;
  draft[decoPart] = b.dataset.value;
  renderDecorate();
});

let launching = false;

async function launch(chosenLook) {
  if (launching) return;
  launching = true;
  let bottle;
  try {
    bottle = await store.createBottle({ text: draft.text, font: draft.font, ...chosenLook });
  } catch (err) {
    console.error(err);
    toast('병을 띄우지 못했어요. 잠시 뒤 다시 해 주세요');
    return;
  } finally {
    launching = false;
  }
  lastSent = bottle;
  draft.text = '';
  Object.assign(draft, DEFAULT_LOOK);
  draftReady = false;
  saveDraft();
  renderWrite();
  renderSent(bottle);
  sound.dip();
  location.replace('#sent');
  loadSea();
}

$('launch-btn').addEventListener('click', () => launch(look()));
$('launch-plain-btn').addEventListener('click', () => launch(DEFAULT_LOOK));

// ---------- 07 띄우기 완료 ----------
function renderSent(b) {
  $('sent-bottle').innerHTML = bottleSVG(b);
  $('share-bottle').innerHTML = bottleSVG(b);
  const text = $('share-text');
  text.textContent = b.text;
  text.className = `share-text font-${b.font}`;
  prepareCard(b);
}

// 병이 작아지며 수평선으로 멀어진다
function playSent() {
  $('sent-bottle').animate(
    [
      { transform: 'translateY(0) scale(1)', opacity: 1 },
      { transform: 'translateY(-60px) scale(.3)', opacity: 1, offset: 0.7 },
      { transform: 'translateY(-82px) scale(.1)', opacity: 0 },
    ],
    { duration: 2800, delay: 300, easing: 'cubic-bezier(.3,.1,.4,1)', fill: 'both' },
  );
}

$('share-btn').addEventListener('click', () => deliverCard('share'));
$('save-img-btn').addEventListener('click', () => deliverCard('save'));

// ---------- 09 보관함 ----------
const ARCHIVE_TABS = ['caught', 'sent', 'collect'];
const archivePanel = $('archive-panel');
let archiveTab = 'caught';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function formatDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function renderArchive(tab) {
  archiveTab = tab;
  for (const t of document.querySelectorAll('#screen-archive .tab')) {
    t.setAttribute('aria-selected', String(t.dataset.tab === tab));
  }
  if (tab === 'caught') renderCaught();
  else if (tab === 'sent') renderSentList();
  else renderCollect();
}

function renderCaught() {
  const list = store.listCaught();
  if (list.length === 0) {
    archivePanel.innerHTML = `<p class="archive-empty">아직 건진 편지가 없어요.<br>바다에서 마음에 드는 병을 건져 보세요.</p>`;
    return;
  }
  archivePanel.innerHTML = list.map((b) => `
    <button type="button" class="archive-item" data-id="${esc(b.id)}">
      <span class="archive-thumb">${bottleSVG(b)}</span>
      <span class="archive-main">
        <span class="archive-text">${esc(b.text)}</span>
        <span class="archive-date">${formatDate(b.caughtAt)}에 건짐</span>
      </span>
    </button>`).join('');
}

async function renderSentList() {
  archivePanel.innerHTML = `<p class="archive-empty">불러오는 중…</p>`;
  let list;
  try {
    list = await store.listMyBottles();
  } catch (err) {
    console.error(err);
    if (archiveTab === 'sent') archivePanel.innerHTML = `<p class="archive-empty">띄운 병을 불러오지 못했어요.<br>잠시 뒤 다시 열어 주세요.</p>`;
    return;
  }
  if (archiveTab !== 'sent') return; // 기다리는 사이 다른 탭으로 옮겼으면 그리지 않는다
  if (list.length === 0) {
    archivePanel.innerHTML = `<div class="archive-empty">아직 띄운 병이 없어요.<a class="btn btn-primary" href="#write">나도 병 띄우기</a></div>`;
    return;
  }
  archivePanel.innerHTML = list.map((b) => `
    <div class="archive-item">
      <span class="archive-thumb">${bottleSVG(b)}</span>
      <span class="archive-main">
        <span class="archive-text">${esc(b.text)}</span>
        <span class="archive-date">${formatDate(b.createdAt)}에 띄움</span>
        ${b.catches > 0
          ? `<span class="badge reached">${b.catches}명에게 닿았어요</span>`
          : `<span class="badge">아직 떠다니는 중</span>`}
      </span>
    </div>`).join('');
}

function renderCollect() {
  const counts = store.trashCounts();
  const total = store.trashTotal(counts);
  const shown = Math.min(total, store.TRASH_GOAL);
  const cells = Object.keys(FOUND_TITLE).map((kind) => {
    const n = counts[kind] || 0;
    return `<div class="collect-cell${n ? '' : ' unknown'}">
      ${trashSVG(kind)}
      <span>${n ? TRASH_NAMES[kind] : '???'}</span>
      <strong>${n ? `${n}개` : ''}</strong>
    </div>`;
  }).join('');
  const unlocks = store.UNLOCKS.map((u) => {
    const done = total >= u.at;
    return `<li class="${done ? 'done' : ''}"><span>${u.name}</span><span>${done ? '해금됨' : `${u.at - total}개 더 모으면 해금`}</span></li>`;
  }).join('');
  archivePanel.innerHTML = `
    <div class="collect-progress">
      <div class="collect-row"><span>바다에서 건진 것</span><span>${shown} / ${store.TRASH_GOAL}</span></div>
      <div class="reel-bar"><div class="reel-fill" style="width:${(shown / store.TRASH_GOAL) * 100}%"></div></div>
    </div>
    <div class="collect-grid">${cells}</div>
    <p class="section-title">꾸미기 재료</p>
    <ul class="unlock-list">${unlocks}</ul>`;
}

document.querySelector('#screen-archive .tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;
  history.replaceState(null, '', `#archive?tab=${t.dataset.tab}`);
  renderArchive(t.dataset.tab);
});

archivePanel.addEventListener('click', (e) => {
  const item = e.target.closest('button.archive-item');
  if (!item) return;
  const b = store.listCaught().find((c) => c.id === item.dataset.id);
  if (!b) return;
  showLetter(b, 'archive');
  location.hash = 'letter';
});

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
  sound.setEnabled(on);
});

// ---------- 00 인트로 ----------
const story = createStory({
  app,
  onStart() {
    store.save('bottle.seenStory', true);
    sound.defer(false); // "이야기 들어보기"·"건너뛰기"를 누른 이 탭에서 바닷소리를 켠다
  },
});

function playStory() {
  if (location.hash && location.hash !== '#sea') location.hash = 'sea';
  sound.defer(true);
  story.play();
}

// ---------- 상단 바 메뉴 ----------
const menuBtn = $('menu-btn');
const topMenu = $('top-menu');

function setMenu(open) {
  topMenu.hidden = !open;
  menuBtn.setAttribute('aria-expanded', String(open));
}

menuBtn.addEventListener('click', () => setMenu(topMenu.hidden));
document.addEventListener('click', (e) => {
  if (!topMenu.hidden && !e.target.closest('.menu-wrap')) setMenu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !topMenu.hidden) {
    setMenu(false);
    menuBtn.focus();
  }
});
$('replay-story-btn').addEventListener('click', () => {
  setMenu(false);
  playStory();
});

// ---------- 시작 ----------
// 바다·인트로를 아래로 당겨 새로고침되는 것 막기
document.addEventListener('touchmove', (e) => {
  if (e.target.closest('.scene, .bottom-fish, .story')) e.preventDefault();
}, { passive: false });

applyTime();
setInterval(applyTime, 60 * 1000);
makeStars();
renderSound(store.load('bottle.sound', true));
sound.setup(store.load('bottle.sound', true));
renderWrite();
window.addEventListener('hashchange', route);
route();
// 처음 방문이고 바다로 들어올 때만 인트로를 자동 재생
if (!store.load('bottle.seenStory', false) && !screens.sea.hidden) playStory();
await loadSea();
seaReady = true;
if (!screens.sea.hidden) sea.start();
