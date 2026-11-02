// 병 저장소. firebase-config.js가 비어 있으면 체험 모드(localStorage)로 동작한다.
// Firebase 연결은 작업 순서 5단계에서 붙인다.
import { firebaseConfig } from '../firebase-config.js';

export const mode = firebaseConfig && firebaseConfig.apiKey ? 'firebase' : 'demo';

const KEY = {
  uid: 'bottle.uid',
  demo: 'bottle.demo.bottles',
  caught: 'bottle.caught',
  mine: 'bottle.mine',
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
