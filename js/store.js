// 병 저장소. firebase-config.js가 비어 있으면 체험 모드(localStorage)로 동작한다.
// Firebase 연결은 작업 순서 5단계에서 붙인다.
import { firebaseConfig } from '../firebase-config.js';

export const mode = firebaseConfig && firebaseConfig.apiKey ? 'firebase' : 'demo';

const KEY = {
  uid: 'bottle.uid',
  demo: 'bottle.demo.bottles',
  caught: 'bottle.caught',
  mine: 'bottle.mine',
  reported: 'bottle.reported',
  trash: 'bottle.trash',
};

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 사생활 보호 모드 등에서는 저장하지 못해도 화면은 계속 동작한다.
  }
}

export function myUid() {
  let id = load(KEY.uid, null);
  if (!id) {
    id = 'local-' + Math.random().toString(36).slice(2, 10);
    save(KEY.uid, id);
  }
  return id;
}

const DAY = 24 * 60 * 60 * 1000;

// 체험 모드에서만 쓰는 예시 병. 실제 Firestore에는 넣지 않는다.
function demoSeeds() {
  const now = Date.now();
  const at = (days, hour) => {
    const d = new Date(now - days * DAY);
    d.setHours(hour, 10, 0, 0);
    return d.getTime();
  };
  const seed = (id, text, font, shape, color, cork, inside, createdAt) => ({
    id, text: `${text} (예시)`, font, shape, color, cork, inside,
    owner: 'demo', catches: 0, reports: 0, hidden: false, createdAt,
  });
  return [
    seed('demo-1', '오늘 노을이 예뻐서 누군가에게 말하고 싶었어요.', 'pen', 'wine', 'amber', 'cork', 'none', at(3, 18)),
    seed('demo-2', '물이 차오르기 전엔 여기가 우리 학교 운동장이었대요.', 'round', 'milk', 'clear', 'ribbon', 'shell', at(12, 14)),
    seed('demo-3', '괜찮아, 천천히 가도 바다는 기다려 줘.', 'pen', 'vial', 'green', 'wax', 'flower', at(1, 23)),
    seed('demo-4', '2100년의 너에게. 우리는 조금 늦었지만 포기하진 않았어.', 'mono', 'jam', 'sky', 'cork', 'stardust', at(30, 21)),
    seed('demo-5', '창문을 열었더니 바람 소리가 좋았다.', 'round', 'wine', 'sky', 'seaglass', 'none', at(6, 10)),
    seed('demo-6', '이 병을 건진 사람에게 좋은 하루가 오기를.', 'pen', 'milk', 'green', 'cork', 'flower', at(2, 8)),
    seed('demo-7', '잠긴 도시 위로도 별은 똑같이 떠요.', 'round', 'vial', 'clear', 'ribbon', 'stardust', at(9, 2)),
    seed('demo-8', '아무 말도 안 하고 바다만 보는 날도 필요해.', 'mono', 'wine', 'clear', 'wax', 'shell', at(5, 16)),
  ];
}

function demoBottles() {
  let list = load(KEY.demo, null);
  if (!Array.isArray(list)) {
    list = demoSeeds();
    save(KEY.demo, list);
  }
  return list;
}

export function caughtIds() {
  return new Set(load(KEY.caught, []).map((c) => c.id));
}

export function mineIds() {
  return new Set(load(KEY.mine, []));
}

// 바다에 띄울 병: 최신순 60개 중 숨김·내 병·이미 건진 병을 뺀다.
export async function listSeaBottles() {
  if (mode === 'firebase') {
    console.warn('Firebase 연결은 아직 준비 중이라 체험 모드로 동작해요.');
  }
  const uid = myUid();
  const caught = caughtIds();
  const mine = mineIds();
  return demoBottles()
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 60)
    .filter((b) => !b.hidden && b.owner !== uid && !mine.has(b.id) && !caught.has(b.id));
}

// 띄우기: 새 병 저장 후, 이 기기의 "띄운 병" 목록에 id를 남긴다.
export async function createBottle({ text, font, shape, color, cork, inside }) {
  const bottle = {
    id: 'local-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    text, font, shape, color, cork, inside,
    owner: myUid(), catches: 0, reports: 0, hidden: false, createdAt: Date.now(),
  };
  const list = demoBottles();
  list.push(bottle);
  save(KEY.demo, list);
  const mine = load(KEY.mine, []);
  mine.push(bottle.id);
  save(KEY.mine, mine);
  return bottle;
}

function updateDemo(id, change) {
  const list = demoBottles();
  const b = list.find((x) => x.id === id);
  if (!b) return null;
  change(b);
  save(KEY.demo, list);
  return b;
}

// 건진 병: catches +1, 이 기기의 "건진 편지"에 저장(같은 병은 한 번만)
export async function catchBottle(bottle) {
  const caught = load(KEY.caught, []);
  if (caught.some((c) => c.id === bottle.id)) return;
  if (bottle.owner !== myUid()) updateDemo(bottle.id, (b) => { b.catches += 1; });
  const { id, text, font, shape, color, cork, inside, createdAt } = bottle;
  caught.unshift({ id, text, font, shape, color, cork, inside, createdAt, caughtAt: Date.now() });
  save(KEY.caught, caught);
}

export function hasReported(id) {
  return load(KEY.reported, []).includes(id);
}

// 신고: reports +1, 3 이상이면 숨김. 같은 기기에서 같은 병은 한 번만.
export async function reportBottle(id) {
  const reported = load(KEY.reported, []);
  if (reported.includes(id)) return false;
  updateDemo(id, (b) => {
    b.reports += 1;
    if (b.reports >= 3) b.hidden = true;
  });
  reported.push(id);
  save(KEY.reported, reported);
  return true;
}

// ---------- 쓰레기 수집품 ----------
export const TRASH_GOAL = 10;
export const UNLOCKS = [
  { at: 3, part: 'cork', value: 'seaglass', name: '마개 · 바다유리 장식' },
  { at: 6, part: 'inside', value: 'stardust', name: '넣을 것 · 별모래' },
];

export function trashCounts() {
  return { pet: 0, vinyl: 0, can: 0, ...load(KEY.trash, {}) };
}

export function trashTotal(counts = trashCounts()) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

export function unlockedValues() {
  const total = trashTotal();
  return new Set(UNLOCKS.filter((u) => total >= u.at).map((u) => u.value));
}

// 쓰레기 하나를 모으고, 이번에 새로 해금된 재료가 있으면 돌려준다.
export function addTrash(kind) {
  const counts = trashCounts();
  const before = trashTotal(counts);
  counts[kind] = (counts[kind] || 0) + 1;
  save(KEY.trash, counts);
  const total = before + 1;
  return { total, counts, unlocked: UNLOCKS.find((u) => u.at === total) || null };
}
