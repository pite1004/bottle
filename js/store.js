// 병 저장소. firebase-config.js가 비어 있으면 체험 모드(localStorage)로 동작한다.
import { firebaseConfig } from '../firebase-config.js';

export const mode = firebaseConfig && firebaseConfig.apiKey ? 'firebase' : 'demo';

// Firebase JS SDK (모듈 CDN). 버전을 올릴 땐 세 줄 모두 같이 바꾼다.
const SDK = 'https://www.gstatic.com/firebasejs/13.1.0';

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

// ---------- Firebase 준비 ----------
let fb = null; // { db, uid, fs: Firestore 함수 모음 }

let initPromise = null;

// Firebase 모드면 SDK를 불러와 익명 로그인까지 마친다. 여러 번 불러도 한 번만 연결한다.
export function init() {
  if (!initPromise) {
    initPromise = connect().catch((err) => {
      initPromise = null; // 다음 호출 때 다시 시도
      throw err;
    });
  }
  return initPromise;
}

async function connect() {
  if (mode !== 'firebase' || fb) return;
  const [{ initializeApp }, auth, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const a = auth.getAuth(app);
  const cred = a.currentUser ? { user: a.currentUser } : await auth.signInAnonymously(a);
  fb = { db: fs.getFirestore(app), uid: cred.user.uid, fs };
}

// 연결을 기다린다. Firebase 모드인데 연결이 안 되면 체험 데이터로 넘어가지 않고 실패로 알린다.
async function ensureReady() {
  if (mode !== 'firebase') return;
  await init();
  if (!fb) throw new Error('Firebase에 연결되지 않았어요');
}

// 통계 모듈 등에서 Firebase를 직접 쓸 때. 체험 모드면 null.
export async function firebase() {
  if (mode !== 'firebase') return null;
  await ensureReady();
  return fb;
}

// 건진 시각의 시간대 (하위 문서 catches.timeOfDay). 06~17 낮, 17~19 노을, 나머지 밤
export function timeOfDayNow(date = new Date()) {
  const h = date.getHours();
  if (h >= 6 && h < 17) return 'day';
  if (h >= 17 && h < 19) return 'sunset';
  return 'night';
}

export function myUid() {
  if (fb) return fb.uid;
  let id = load(KEY.uid, null);
  if (!id) {
    id = 'local-' + Math.random().toString(36).slice(2, 10);
    save(KEY.uid, id);
  }
  return id;
}

function fromDoc(d) {
  const data = d.data();
  const ts = data.createdAt;
  return { ...data, id: d.id, createdAt: ts && ts.toMillis ? ts.toMillis() : Date.now() };
}

// ---------- 체험 모드 데이터 ----------
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

function updateDemo(id, change) {
  const list = demoBottles();
  const b = list.find((x) => x.id === id);
  if (!b) return null;
  change(b);
  save(KEY.demo, list);
  return b;
}

export function caughtIds() {
  return new Set(load(KEY.caught, []).map((c) => c.id));
}

export function mineIds() {
  return new Set(load(KEY.mine, []));
}

// ---------- 바다 ----------
let newestSeen = 0; // 처음 받은 목록에서 가장 최근 병의 시각. 이 뒤의 병만 실시간으로 듣는다

function canFloat(b) {
  return !b.hidden && b.owner !== myUid() && !mineIds().has(b.id) && !caughtIds().has(b.id);
}

const SEA_SIZE = 60;   // 앱을 열 때 받는 병 수 (읽기 비용)
const SEA_NEWEST = 20; // 그중 최신 병. 나머지는 아직 아무도 안 건진 병을 무작위로

// 문서 ID는 익명 uid로 시작해서 무작위 위치부터 읽으면 무작위로 뽑힌다. 끝까지 읽어도 모자라면 처음으로 돌아간다.
async function randomBottles(filters, count) {
  const { collection, query, orderBy, documentId, startAt, endBefore, limit, getDocs } = fb.fs;
  const letters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const pick = () => letters[Math.floor(Math.random() * letters.length)];
  const key = pick() + pick();
  const ordered = [collection(fb.db, 'bottles'), ...filters, orderBy(documentId())];
  const first = await getDocs(query(...ordered, startAt(key), limit(count)));
  if (first.size >= count) return first.docs;
  const rest = await getDocs(query(...ordered, endBefore(key), limit(count - first.size)));
  return [...first.docs, ...rest.docs];
}

// 사람이 많아져도 병이 골고루 닿게: 최신 병 + 아직 아무도 안 건진 병, 모자라면 아무 병으로 채운다
async function pickSeaBottles() {
  const { collection, query, where, orderBy, limit, getDocs } = fb.fs;
  const [newest, unread] = await Promise.all([
    getDocs(query(collection(fb.db, 'bottles'), orderBy('createdAt', 'desc'), limit(SEA_NEWEST))),
    randomBottles([where('catches', '==', 0)], SEA_SIZE - SEA_NEWEST),
  ]);
  const picked = new Map([...newest.docs, ...unread].map((d) => [d.id, fromDoc(d)]));
  if (picked.size < SEA_SIZE) {
    for (const d of await randomBottles([], SEA_SIZE - picked.size)) picked.set(d.id, fromDoc(d));
  }
  return { list: [...picked.values()], newest: newest.empty ? 0 : fromDoc(newest.docs[0]).createdAt };
}

// 바다에 띄울 병에서 숨김·내 병을 뺀다. 이미 건진 병은 again 표시를 달아 남겨 두고(바다가 비어 보이지 않게), 새 병이 먼저 떠내려온다.
export async function listSeaBottles() {
  await ensureReady();
  let list;
  if (fb) {
    ({ list, newest: newestSeen } = await pickSeaBottles());
  } else {
    list = demoBottles().slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, SEA_SIZE);
    newestSeen = list.length ? list[0].createdAt : 0;
  }
  const uid = myUid();
  const mine = mineIds();
  const caught = caughtIds();
  return list
    .filter((b) => !b.hidden && b.owner !== uid && !mine.has(b.id))
    .map((b) => (caught.has(b.id) ? { ...b, again: true } : b));
}

// 앱을 연 뒤에 새로 띄워진 병을 실시간으로 받는다. 새 병만 듣기 때문에 읽기는 새 병 수만큼만 든다.
// 체험 모드는 이 기기뿐이라 듣지 않는다.
export function watchNewBottles({ onAdd, onRemove }) {
  if (!fb) return;
  const { collection, query, where, orderBy, onSnapshot, Timestamp } = fb.fs;
  const fresh = query(collection(fb.db, 'bottles'), where('createdAt', '>', Timestamp.fromMillis(newestSeen)), orderBy('createdAt'));
  onSnapshot(fresh, (snap) => {
    for (const change of snap.docChanges()) {
      const b = fromDoc(change.doc);
      if (change.type === 'removed' || b.hidden) onRemove(b.id);
      else if (change.type === 'added' && canFloat(b)) onAdd(b);
    }
  }, (err) => console.error(err));
}

// 이 기기에서 건진 편지 (최근 것부터)
export function listCaught() {
  return load(KEY.caught, []);
}

// 별표 (마음에 남은 편지)
export function isStarred(id) {
  return load('bottle.starred', []).includes(id);
}

export function toggleStar(id) {
  const list = load('bottle.starred', []);
  const on = !list.includes(id);
  save('bottle.starred', on ? [...list, id] : list.filter((x) => x !== id));
  return on;
}

// 내가 띄운 병: owner == 내 uid. 정렬은 클라이언트에서 (복합 인덱스 불필요)
export async function listMyBottles() {
  await ensureReady();
  const uid = myUid();
  let list;
  if (fb) {
    const { collection, query, where, getDocs } = fb.fs;
    const snap = await getDocs(query(collection(fb.db, 'bottles'), where('owner', '==', uid)));
    list = snap.docs.map(fromDoc);
  } else {
    list = demoBottles().filter((b) => b.owner === uid);
  }
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

// 내 병의 여정: 병 문서 + 건진 기록(catches 하위 문서: 시각·시간대만)
export async function getJourney(id) {
  await ensureReady();
  if (fb) {
    const { doc, getDoc, collection, getDocs } = fb.fs;
    const [snap, caught] = await Promise.all([
      getDoc(doc(fb.db, 'bottles', id)),
      getDocs(collection(fb.db, 'bottles', id, 'catches')),
    ]);
    if (!snap.exists()) return null;
    const catches = caught.docs.map((d) => {
      const c = d.data();
      return { at: c.caughtAt && c.caughtAt.toMillis ? c.caughtAt.toMillis() : Date.now(), timeOfDay: c.timeOfDay };
    }).sort((a, b) => a.at - b.at);
    return { bottle: fromDoc(snap), catches };
  }
  const bottle = demoBottles().find((b) => b.id === id);
  return bottle ? { bottle, catches: [] } : null;
}

// 병 띄우기는 1인당 최대 10개. 보안 규칙이 문서 ID "{uid}_{1~10}"만 허용해서 서버에서도 강제된다.
export const MAX_BOTTLES = 10;

export class BottleLimitError extends Error {
  constructor() {
    super('병을 모두 띄웠어요');
    this.name = 'BottleLimitError';
  }
}

// 띄우기: 문서 ID "{내 uid}_{번호}"로 저장. 번호 = 내 병 개수 + 1, 이미 있으면 다음 빈 번호로 한 번 더.
export async function createBottle({ text, font, shape, color, cork, inside }) {
  await ensureReady();
  const uid = myUid();
  const fields = { text, font, shape, color, cork, inside, owner: uid, catches: 0, stars: 0, reports: 0, hidden: false };
  const mineNow = await listMyBottles();
  if (mineNow.length >= MAX_BOTTLES) throw new BottleLimitError();
  const taken = new Set(mineNow.map((b) => b.id));
  const free = [];
  for (let n = 1; n <= MAX_BOTTLES; n++) if (!taken.has(`${uid}_${n}`)) free.push(n);
  // 개수 + 1번부터, 그 앞의 빈 번호는 뒤로
  const order = [...free.filter((n) => n >= mineNow.length + 1), ...free.filter((n) => n < mineNow.length + 1)];
  if (!order.length) throw new BottleLimitError();

  let bottle = null;
  if (fb) {
    const { doc, setDoc, serverTimestamp } = fb.fs;
    let lastErr = null;
    for (const n of order.slice(0, 2)) {
      const id = `${uid}_${n}`;
      try {
        await setDoc(doc(fb.db, 'bottles', id), { ...fields, createdAt: serverTimestamp() });
        bottle = { ...fields, id, createdAt: Date.now() };
        break;
      } catch (err) {
        // 이미 있는 ID면 규칙이 거절한다 (permission-denied) → 다음 빈 번호로
        if (err && err.code !== 'permission-denied') throw err;
        lastErr = err;
      }
    }
    if (!bottle) throw lastErr || new BottleLimitError();
  } else {
    bottle = { ...fields, id: `${uid}_${order[0]}`, createdAt: Date.now() };
    const list = demoBottles();
    list.push(bottle);
    save(KEY.demo, list);
  }
  const mine = load(KEY.mine, []);
  mine.push(bottle.id);
  save(KEY.mine, mine);
  return bottle;
}

// 같은 배치에서 "내 하위 문서 만들기 + 부모 카운터 +1" (보안 규칙이 한 사람당 한 번만 허용)
async function addMine(bottleId, sub, fields, counter) {
  const { doc, writeBatch, serverTimestamp, increment } = fb.fs;
  const batch = writeBatch(fb.db);
  const stamp = sub === 'catches' ? 'caughtAt' : 'at';
  batch.set(doc(fb.db, 'bottles', bottleId, sub, fb.uid), { ...fields, [stamp]: serverTimestamp() });
  batch.update(doc(fb.db, 'bottles', bottleId), { [counter]: increment(1) });
  await batch.commit();
}

// 건진 병: catches/{내 uid} + catches +1, 이 기기의 "건진 편지"에 저장(같은 병은 한 번만)
export async function catchBottle(bottle) {
  const caught = load(KEY.caught, []);
  if (caught.some((c) => c.id === bottle.id)) return;
  const { id, text, font, shape, color, cork, inside, createdAt } = bottle;
  caught.unshift({ id, text, font, shape, color, cork, inside, createdAt, caughtAt: Date.now() });
  save(KEY.caught, caught);
  if (bottle.owner === myUid()) return;
  await ensureReady();
  if (fb) {
    await addMine(id, 'catches', { timeOfDay: timeOfDayNow() }, 'catches');
  } else {
    updateDemo(id, (b) => { b.catches += 1; });
  }
}

// 별표를 처음 켤 때만 서버에 stars/{내 uid} + stars +1 (끄는 건 이 기기에서만)
export async function sendStar(id) {
  const sent = load('bottle.starSent', []);
  if (sent.includes(id)) return false;
  sent.push(id);
  save('bottle.starSent', sent);
  await ensureReady();
  if (fb) await addMine(id, 'stars', {}, 'stars');
  else updateDemo(id, (b) => { b.stars = (b.stars || 0) + 1; });
  return true;
}

export function hasReported(id) {
  return load(KEY.reported, []).includes(id);
}

// 신고: reports +1, 결과가 3 이상이면 같은 쓰기에서 숨김. 같은 기기에서 같은 병은 한 번만.
export async function reportBottle(id) {
  const reported = load(KEY.reported, []);
  if (reported.includes(id)) return false;
  await ensureReady();
  if (fb) {
    const { doc, runTransaction, serverTimestamp } = fb.fs;
    const ref = doc(fb.db, 'bottles', id);
    await runTransaction(fb.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const reports = (snap.data().reports || 0) + 1;
      // reports/{내 uid}를 처음 만드는 같은 쓰기에서만 +1, 3 이상이면 숨김
      tx.set(doc(fb.db, 'bottles', id, 'reports', fb.uid), { at: serverTimestamp() });
      tx.update(ref, reports >= 3 ? { reports, hidden: true } : { reports });
    });
  } else {
    updateDemo(id, (b) => {
      b.reports += 1;
      if (b.reports >= 3) b.hidden = true;
    });
  }
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
