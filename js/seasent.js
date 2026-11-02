// 바다가 보낸 병: 조건을 처음 채우면 빛나는 특별한 병이 떠내려온다.
// Firestore에 저장하지 않고 앱 안에 고정된 내용으로 처리한다. 기록은 이 기기의 localStorage.
import { load, save } from './store.js';

export const SEA_LETTERS = {
  trash5: {
    lines: ['오늘 당신이 건져낸 건 편지만이 아니었어요.', '바다가 아주 조금, 가벼워졌어요.'],
    look: { shape: 'milk', color: 'green', cork: 'seaglass', inside: 'shell' },
  },
  letters5: {
    lines: ['서로 다른 사람이 쓴 다섯 개의 이야기.', '모두 같은 바다를 건너 당신에게 왔어요.'],
    look: { shape: 'wine', color: 'sky', cork: 'ribbon', inside: 'flower' },
  },
  letters10: {
    lines: [
      '이 병들은 모두 2026년에서 떠내려왔대요.',
      '바다가 아직 도시를 삼키기 전, 누군가 이 편지를 쓰던 그곳에서.',
      '그곳의 내일은, 아직 정해지지 않았어요.',
    ],
    look: { shape: 'wine', color: 'amber', cork: 'wax', inside: 'stardust' },
  },
  reached: {
    lines: [
      '당신의 이야기가 누군가에게 닿았어요.',
      '이런 마음을 편지에만 담지 말고, 우리가 사는 바다를 지키며 직접 나눠보는 건 어떨까요?',
    ],
    look: { shape: 'jam', color: 'clear', cork: 'cork', inside: 'stardust' },
  },
};

const KEY = {
  triggered: 'bottle.sea.triggered', // 조건을 채운 단계 (한 번만)
  received: 'bottle.sea.received',   // 건진 단계 [{ key, receivedAt }]
};

// 지금 수치로 새로 채운 단계가 있으면 기록하고 그 목록을 돌려준다.
export function checkMilestones({ letters, trash, reached }) {
  const triggered = load(KEY.triggered, []);
  const met = [];
  if (trash >= 5) met.push('trash5');
  if (letters >= 5) met.push('letters5');
  if (letters >= 10) met.push('letters10');
  if (reached >= 1) met.push('reached');
  const fresh = met.filter((k) => !triggered.includes(k));
  if (fresh.length) save(KEY.triggered, [...triggered, ...fresh]);
  return fresh;
}

export function listReceived() {
  return load(KEY.received, []);
}

// 조건은 채웠지만 아직 건지지 않은 병 (바다에 떠내려올 것)
export function pendingSeaBottles() {
  const got = new Set(listReceived().map((r) => r.key));
  return load(KEY.triggered, []).filter((k) => !got.has(k) && SEA_LETTERS[k]).map(seaBottle);
}

export function receive(key) {
  const list = listReceived();
  if (list.some((r) => r.key === key)) return;
  list.unshift({ key, receivedAt: Date.now() });
  save(KEY.received, list);
}

// 바다·편지 화면에서 일반 병과 같은 모양으로 다루기 위한 데이터
export function seaBottle(key, receivedAt) {
  const s = SEA_LETTERS[key];
  return {
    id: `sea-${key}`,
    special: key,
    lines: s.lines,
    text: s.lines.join(' '),
    font: 'pen',
    ...s.look,
    createdAt: receivedAt || Date.now(),
    receivedAt,
  };
}
