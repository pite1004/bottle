// 화면 전환과 앱 상태.
import { createSea } from './sea.js';
import { bottleSVG, trashSVG, TRASH_NAMES, OPTIONS, DEFAULT_LOOK, optionLabel } from './bottle.js';
import { checkText } from './moderation.js';
import { renderCard, renderRecordCard, shareOrSave } from './card.js';
import { createStory } from './intro.js';
import { createCoach, coachSeen, flyTo, bounce } from './guide.js';
import { checkMilestones, pendingSeaBottles, receive, listReceived, seaBottle } from './seasent.js';
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
  record: $('screen-record'),
  soon: $('screen-soon'),
};

let currentLetter = null;
let letterFresh = false; // 방금 바다에서 건진 편지인지 (보관함에서 다시 보는 것과 구분)
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
  if (target === 'record') renderRecord();
  if (target === 'archive') {
    clearArchiveNews();
    const tab = new URLSearchParams(location.hash.split('?')[1] || '').get('tab');
    renderArchive(ARCHIVE_TABS.includes(tab) ? tab : 'caught');
  }
  if (target === 'sea') {
    if (seaReady) sea.start(); // 첫 병 목록을 받기 전엔 시작하지 않는다 (빈 바다 문구가 잠깐 뜨지 않게)
    enterSea();
  } else {
    coach.close();
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
  app.classList.toggle('fishing', on);
  fishPanel.hidden = !on;
  if (!on) {
    holdBtn.disabled = true; // 다음에 걸릴 때까지 꾹 누르기 꺼 둠
    holdPointer = null;
    setHolding(false);
  }
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
    addArchiveNew();
    if (f.data.special) {
      // 바다가 보낸 병: 이 기기에만 기록 (Firestore에 저장하지 않음)
      receive(f.data.special);
      const got = listReceived().find((r) => r.key === f.data.special);
      showLetter(seaBottle(f.data.special, got && got.receivedAt));
      location.hash = 'letter';
      sea.setSpecial(pendingSeaBottles());
    } else if (f.kind === 'bottle') {
      // 건진 횟수 기록이 실패해도 편지는 보여 준다
      store.catchBottle(f.data).catch((err) => console.error(err));
      queueCoach('caught');
      showLetter(f.data);
      location.hash = 'letter';
      loadSea();
      checkSeaGifts();
    } else {
      queueCoach('trash');
      showFound(f.data.trash, store.addTrash(f.data.trash));
      location.hash = 'found';
      checkSeaGifts();
    }
  },
  onEmptyChange(empty) {
    $('sea-empty').hidden = !empty;
  },
});

// 꾹 누르기: 걸려 있는 동안엔 화면 아무 데나 (손가락·마우스, pointer 이벤트)
// "놓아주기"와 상단 바 버튼은 제외
let holdPointer = null;

function hooked() {
  return !screens.sea.hidden && !fishPanel.hidden && !holdBtn.disabled;
}

app.addEventListener('pointerdown', (e) => {
  if (!hooked() || holdPointer !== null) return;
  if (e.target.closest('#release-btn, .topbar, .story')) return;
  e.preventDefault();
  holdPointer = e.pointerId;
  setHolding(true);
});
for (const type of ['pointerup', 'pointercancel']) {
  window.addEventListener(type, (e) => {
    if (e.pointerId !== holdPointer) return;
    holdPointer = null;
    setHolding(false);
  });
}
// 길게 누를 때 뜨는 메뉴(복사·이미지 저장 등) 막기
app.addEventListener('contextmenu', (e) => {
  if (hooked()) e.preventDefault();
});

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
  letterFresh = from === 'sea';
  const back = $('letter-back');
  back.href = from === 'archive' ? '#archive' : '#sea';
  back.setAttribute('aria-label', from === 'archive' ? '보관함으로 돌아가기' : '바다로 돌아가기');
  const fromSea = !!b.special;
  $('letter-title').textContent = fromSea ? '바다가 보낸 병' : '건진 병';
  $('letter-card').classList.toggle('from-sea', fromSea);
  $('letter-bottle').classList.toggle('from-sea', fromSea);
  $('letter-from').hidden = !fromSea;
  $('report-btn').hidden = fromSea;
  $('star-btn').hidden = fromSea;
  $('letter-bottle').innerHTML = bottleSVG(b);
  const text = $('letter-text');
  text.className = `letter-text font-${b.font}`;
  if (fromSea) {
    // 문장이 한 줄씩 나타난다
    text.innerHTML = b.lines.map((l) => `<span>${esc(l)}</span>`).join('');
    [...text.children].forEach((span, i) => {
      span.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
        { duration: 900, delay: 400 + i * 1300, easing: 'ease-out', fill: 'backwards' });
    });
    $('letter-meta').textContent = `바다가 보낸 병 · ${formatDate(b.receivedAt || Date.now())}`;
  } else {
    text.textContent = b.text;
    $('letter-meta').textContent = letterMeta(b.createdAt);
    renderStar();
  }
  prepareCard(b);
}

// ---------- 별표 (마음에 남은 편지) ----------
function renderStar() {
  const on = !!currentLetter && store.isStarred(currentLetter.id);
  const btn = $('star-btn');
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', on ? '마음에 남은 편지 표시 빼기' : '마음에 남은 편지로 표시');
}

$('star-btn').addEventListener('click', () => {
  if (!currentLetter || currentLetter.special) return;
  const on = store.toggleStar(currentLetter.id);
  renderStar();
  toast(on ? '마음에 남은 편지로 표시했어요' : '표시를 뺐어요');
});

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
  queueCoach('sent');
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

const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>';

function renderCaught() {
  const list = store.listCaught();
  const fromSea = listReceived();
  const view = store.load('bottle.caughtView', 'list');
  let html = '';

  // 바다가 보낸 병은 맨 위에 따로
  if (fromSea.length) {
    html += `<p class="section-title">바다가 보낸 병</p>` + fromSea.map((r) => {
      const b = seaBottle(r.key, r.receivedAt);
      return `<button type="button" class="archive-item from-sea" data-sea="${r.key}">
        <span class="archive-thumb">${bottleSVG(b)}</span>
        <span class="archive-main">
          <span class="archive-text">${esc(b.lines[0])}</span>
          <span class="archive-date">${formatDate(r.receivedAt)} · 바다로부터</span>
        </span>
      </button>`;
    }).join('');
  }

  if (list.length === 0) {
    html += `<div class="archive-empty">아직 건진 편지가 없어요.<br>바다에서 떠다니는 병을 탭해보세요<a class="btn btn-primary" href="#sea">바다로 가기</a></div>`;
    archivePanel.innerHTML = html;
    return;
  }

  html += `<div class="view-toggle" role="group" aria-label="보기 방식">
    <button type="button" data-view="list" aria-pressed="${view === 'list'}">목록</button>
    <button type="button" data-view="shelf" aria-pressed="${view === 'shelf'}">선반</button>
  </div>`;

  if (view === 'shelf') {
    // 먼저 건진 것부터, 한 칸에 5개
    const ordered = list.slice().sort((a, b) => a.caughtAt - b.caughtAt);
    let rows = '';
    for (let i = 0; i < ordered.length; i += 5) {
      rows += `<div class="shelf-row"><div class="shelf-items">${ordered.slice(i, i + 5).map((b) => `
        <button type="button" class="shelf-bottle" data-id="${esc(b.id)}" aria-label="${esc(b.text.slice(0, 30))} (${formatDate(b.caughtAt)}에 건짐)">
          ${bottleSVG(b)}${store.isStarred(b.id) ? `<span class="shelf-star">${STAR_SVG}</span>` : ''}
        </button>`).join('')}</div><div class="shelf-plank"></div></div>`;
    }
    html += `<div class="shelf">${rows}</div>`;
  } else {
    html += list.map((b) => `
      <button type="button" class="archive-item" data-id="${esc(b.id)}">
        <span class="archive-thumb">${bottleSVG(b)}</span>
        <span class="archive-main">
          <span class="archive-text">${esc(b.text)}</span>
          <span class="archive-date">${formatDate(b.caughtAt)}에 건짐</span>
        </span>
        ${store.isStarred(b.id) ? `<span class="archive-star" aria-label="마음에 남은 편지">${STAR_SVG}</span>` : ''}
      </button>`).join('');
  }
  archivePanel.innerHTML = html;
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
    archivePanel.innerHTML = `<div class="archive-empty">띄운 병이 누군가에게 닿으면<br>여기에 숫자가 올라가요<a class="btn btn-primary" href="#write">병 띄우기</a></div>`;
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
  const empty = total === 0
    ? `<p class="archive-empty" style="padding:8px 8px 4px">가끔 병 대신 쓰레기가 걸려요.<br>모으면 꾸미기 재료가 열려요</p>`
    : '';
  archivePanel.innerHTML = `${empty}
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
  const toggle = e.target.closest('.view-toggle button');
  if (toggle) {
    store.save('bottle.caughtView', toggle.dataset.view);
    renderCaught();
    return;
  }
  const item = e.target.closest('button.archive-item, button.shelf-bottle');
  if (!item) return;
  if (item.dataset.sea) {
    const r = listReceived().find((x) => x.key === item.dataset.sea);
    if (r) showLetter(seaBottle(r.key, r.receivedAt), 'archive');
  } else {
    const b = store.listCaught().find((c) => c.id === item.dataset.id);
    if (!b) return;
    showLetter(b, 'archive');
  }
  location.hash = 'letter';
});

// ---------- 나의 바다 기록 ----------
function recordStats(reached) {
  const caught = store.listCaught();
  const n = caught.length;
  const days = caught.map((b) => Math.floor((b.caughtAt - b.createdAt) / DAY)).filter((d) => d >= 0);
  const colors = {};
  for (const b of caught) colors[b.color] = (colors[b.color] || 0) + 1;
  const topColor = Object.entries(colors).sort((a, b) => b[1] - a[1])[0];
  const night = caught.filter((b) => timeOfDay(new Date(b.caughtAt).getHours()) === 'night').length;
  return [
    { label: '건진 편지', value: `${n}통` },
    { label: '건져낸 쓰레기', value: `${store.trashTotal()}개` },
    { label: '가장 오래 떠다닌 병', value: days.length ? `${Math.max(...days)}일` : '—' },
    { label: '가장 많이 만난 유리', value: topColor ? optionLabel('color', topColor[0]) : '—' },
    { label: '밤에 건진 편지', value: n ? `${Math.round((night / n) * 100)}%` : '—' },
    { label: '내 병이 닿은 사람', value: reached == null ? '…' : `${reached}명` },
  ];
}

let recordQuote = null;

function drawRecord(reached) {
  const stats = recordStats(reached);
  $('record-list').innerHTML = stats.map((s) => `<div><dt>${s.label}</dt><dd>${s.value}</dd></div>`).join('');
  const fig = $('record-quote');
  fig.hidden = !recordQuote;
  if (recordQuote) {
    const q = $('record-quote-text');
    q.textContent = recordQuote.text;
    q.className = `font-${recordQuote.font}`;
  }
  cardPromise = renderRecordCard(stats, recordQuote, app.dataset.time);
  cardPromise.catch((err) => console.error(err));
}

async function renderRecord() {
  // 별표 친 편지 중 하나 (화면을 열 때마다 하나를 고른다. 없으면 생략)
  const starred = store.listCaught().filter((b) => store.isStarred(b.id));
  recordQuote = starred.length ? starred[Math.floor(Math.random() * starred.length)] : null;
  drawRecord(store.load('bottle.catchTotal', null));
  try {
    const mine = await store.listMyBottles();
    const total = mine.reduce((sum, b) => sum + (b.catches || 0), 0);
    if (!screens.record.hidden) drawRecord(total);
  } catch (err) {
    console.error(err);
  }
}

$('record-save').addEventListener('click', () => deliverCard('save'));

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
  onDone() {
    lastActivity = Date.now();
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

// ---------- 사용법 안내: 보관함 배지 ----------
// 배지 숫자 = 보관함을 마지막으로 연 뒤 새로 들어온 건진 편지·쓰레기 수
const archiveBtn = $('archive-btn');
const archiveIcon = $('archive-icon');

function renderArchiveBadge(holdBack = 0) {
  const n = Math.max(0, store.load('bottle.archiveNew', 0) - holdBack);
  const dot = n === 0 && store.load('bottle.newsDot', false);
  const count = $('archive-count');
  count.hidden = n === 0;
  count.textContent = n > 99 ? '99+' : String(n);
  $('archive-dot').hidden = !dot;
  archiveBtn.setAttribute('aria-label', n ? `보관함, 새로 들어온 것 ${n}개` : dot ? '보관함, 새 소식 있음' : '보관함');
}

function addArchiveNew() {
  store.save('bottle.archiveNew', store.load('bottle.archiveNew', 0) + 1);
}

function clearArchiveNews() {
  store.save('bottle.archiveNew', 0);
  store.save('bottle.newsDot', false);
  renderArchiveBadge();
}

// ---------- 사용법 안내: 날아가는 연출 ----------
// "바다로 돌려보내기"·"바다로 돌아가기"를 누른 순간의 그림 위치를 기억했다가, 바다에 돌아오면 보관함으로 날린다
let pendingFly = null;

$('letter-return').addEventListener('click', () => {
  const svg = $('letter-bottle').querySelector('svg');
  if (letterFresh && svg) pendingFly = { rect: svg.getBoundingClientRect(), svg: bottleSVG(currentLetter) };
});

$('found-return').addEventListener('click', () => {
  const svg = $('found-item').querySelector('svg');
  if (svg) pendingFly = { rect: svg.getBoundingClientRect(), svg: trashSVG(currentFound) };
});

// ---------- 사용법 안내: 한 번만 뜨는 말풍선 ----------
const coach = createCoach(app);
const coachQueue = [];
let lastActivity = Date.now();

document.addEventListener('pointerdown', () => { lastActivity = Date.now(); }, true);
document.addEventListener('keydown', () => { lastActivity = Date.now(); }, true);

function queueCoach(key) {
  if (!coachSeen(key) && !coachQueue.includes(key)) coachQueue.push(key);
}

// 인트로가 끝난 뒤, 바다 화면에서, 낚시 중이 아닐 때만. 동시에 하나만.
function canCoach() {
  return !screens.sea.hidden && !story.playing && !sea.busy && !coach.visible;
}

function tryCoach() {
  if (!canCoach()) return;
  while (coachQueue.length) {
    const key = coachQueue.shift();
    if (coachSeen(key)) continue;
    coach.show(key, () => archiveIcon.getBoundingClientRect(), 'below');
    return;
  }
}

// 바다로 돌아왔을 때: 날아가는 연출 → 배지 +1 → 말풍선
function enterSea() {
  lastActivity = Date.now();
  if (pendingFly) {
    const fly = pendingFly;
    pendingFly = null;
    renderArchiveBadge(1); // 날아와 닿는 순간 +1 되도록 하나 덜 보여 준다
    requestAnimationFrame(() => {
      flyTo(app, fly.rect, fly.svg, archiveIcon).then(() => {
        renderArchiveBadge();
        bounce(archiveIcon);
        setTimeout(tryCoach, 250);
      });
    });
  } else {
    renderArchiveBadge();
    setTimeout(tryCoach, 500);
  }
}

// 10초 동안 아무 조작이 없으면 가장 가까운 병 위에 "병을 탭해보세요" (병을 건진 적 있으면 안 뜸)
setInterval(() => {
  if (!canCoach()) return;
  if (coachQueue.length) return tryCoach();
  if (Date.now() - lastActivity < 10000) return;
  if (coachSeen('idle') || store.listCaught().length > 0) return;
  const near = sea.floaters
    .filter((f) => f.kind === 'bottle' && f.z > 0.15 && f.z < 0.95)
    .sort((a, b) => b.z - a.z)[0];
  if (!near) return;
  coach.show('idle', () => (sea.floaters.includes(near) ? near.el.getBoundingClientRect() : null), 'above');
}, 1000);

// ---------- 바다가 보낸 병 ----------
// 조건(쓰레기 5개, 편지 5·10통, 내 병이 처음 닿음)을 처음 채우면 빛나는 병을 바다에 띄운다
function checkSeaGifts() {
  checkMilestones({
    letters: store.listCaught().length,
    trash: store.trashTotal(),
    reached: store.load('bottle.catchTotal', 0) || 0,
  });
  sea.setSpecial(pendingSeaBottles());
}

// ---------- 사용법 안내: 재방문 소식 ----------
// 내 병들의 catches 합계가 지난번보다 늘었으면 알려 준다
const newsBanner = $('news-banner');
let newsTimer = 0;

async function checkNews() {
  let mine;
  try {
    mine = await store.listMyBottles();
  } catch (err) {
    console.error(err);
    return;
  }
  const total = mine.reduce((sum, b) => sum + (b.catches || 0), 0);
  const prev = store.load('bottle.catchTotal', null);
  store.save('bottle.catchTotal', total);
  checkSeaGifts();
  if (prev === null || total <= prev) return;
  store.save('bottle.newsDot', true);
  renderArchiveBadge();
  // 인트로가 도는 중이면 끝난 뒤에
  const show = () => {
    if (story.playing) return setTimeout(show, 500);
    newsBanner.textContent = `띄운 병이 ${total - prev}명에게 더 닿았어요`;
    newsBanner.hidden = false;
    newsBanner.animate([{ opacity: 0, transform: 'translate(-50%, -8px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }],
      { duration: 300, easing: 'ease-out' });
    clearTimeout(newsTimer);
    newsTimer = setTimeout(() => { newsBanner.hidden = true; }, 4000);
  };
  show();
}

newsBanner.addEventListener('click', () => {
  newsBanner.hidden = true;
  location.hash = 'archive?tab=sent';
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
checkSeaGifts(); // 지난번에 조건을 채웠지만 아직 못 건진 병도 다시 떠내려온다
if (!screens.sea.hidden) sea.start();
checkNews();
