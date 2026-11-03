// 통계 기록: 방문자(visitors/{uid})와 이벤트(events). 발표용 숫자를 남긴다.
// 익명 uid, 횟수, 시각, 기기 종류만 기록한다. 글귀 내용·IP·User-Agent·이름·연락처는 절대 기록하지 않는다.
// 체험 모드에서는 기록하지 않고 콘솔에만 출력한다.
import * as store from './store.js';

const FLUSH_MS = 5000;            // 이 간격으로 모아서 한 번에 저장
const SESSION_GAP = 30 * 60 * 1000; // 30분 넘게 지나서 다시 열면 새 방문
const MAX_PER_BATCH = 400;        // 배치 한 번에 최대 500개 쓰기 (방문자 갱신 1개 포함 여유)

// 이벤트 → 방문자 개인 누계 필드
const COUNTER_FOR = {
  intro_complete: 'introCompletes',
  cast: 'castCount',
  catch_letter: 'lettersCaught',
  catch_trash: 'trashCaught',
  catch_sea_bottle: 'seaBottles',
  write_start: 'writeStarts',
  bottle_launch: 'bottlesLaunched',
  share_card: 'shareCount',
  save_image: 'shareCount',
  letter_star: 'starsGiven',
  dream_unlocked: 'dreamUnlocks',
  dream_complete: 'dreamCompletes',
};

// 처음 만들 때 0으로 넣는 누계 (꿈꾸기 누계는 생길 때 increment로만 쓴다)
const COUNTERS = ['introCompletes', 'castCount', 'lettersCaught', 'trashCaught', 'seaBottles',
  'writeStarts', 'bottlesLaunched', 'shareCount', 'starsGiven'];

// 기기 종류만 (User-Agent 문자열은 저장하지 않는다)
export function deviceInfo() {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const os = /iPhone|iPad|iPod/.test(ua) || iPadOS ? 'ios' : /Android/i.test(ua) ? 'android' : 'other';
  const device = os !== 'other' || /Mobi/i.test(ua) ? 'mobile' : 'desktop';
  return { device, os };
}

// 한국 시간 기준 날짜·시
function kst(ms = Date.now()) {
  const d = new Date(ms + 9 * 3600 * 1000);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

// 유입 경로: ?ref=card|journey|record, 없으면 referrer로 instagram/kakao/other/direct
// 주소창에 남지 않게 ref·b는 읽은 뒤 지운다.
function readSource() {
  const url = new URL(location.href);
  const ref = url.searchParams.get('ref');
  if (url.searchParams.has('ref') || url.searchParams.has('b')) {
    url.searchParams.delete('ref');
    url.searchParams.delete('b');
    history.replaceState(history.state, '', url.pathname + url.search + url.hash);
  }
  if (['card', 'journey', 'record'].includes(ref)) return ref;
  const r = document.referrer;
  if (!r) return 'direct';
  try {
    const host = new URL(r).hostname;
    if (host === location.hostname) return 'direct';
    if (/instagram/i.test(host)) return 'instagram';
    if (/kakao/i.test(host)) return 'kakao';
  } catch {
    // 이상한 referrer는 기타로
  }
  return 'other';
}

let queue = [];
let bumps = {};
let ready = Promise.resolve(false);
let fbRef = null;
let flushing = false;
const { device } = deviceInfo();

// 앱을 열 때 한 번. 방문자 문서를 만들거나 갱신하고, 새 방문이면 session_start
export function start() {
  const source = readSource();
  ready = begin(source).catch((err) => {
    console.warn('통계를 시작하지 못했어요', err);
    return false;
  });
  setInterval(flush, FLUSH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
  });
  window.addEventListener('pagehide', flush);
  return ready;
}

async function begin(source) {
  if (store.mode !== 'firebase') {
    console.debug('[통계·체험 모드] 기록하지 않아요. 방문 경로:', source);
    return false;
  }
  const fb = await store.firebase();
  const { doc, getDoc, setDoc, serverTimestamp, increment } = fb.fs;
  const vref = doc(fb.db, 'visitors', fb.uid);
  fbRef = { fb, vref };
  const snap = await getDoc(vref);
  const { os } = deviceInfo();
  if (!snap.exists()) {
    const zero = Object.fromEntries(COUNTERS.map((k) => [k, 0]));
    await setDoc(vref, {
      firstSeen: serverTimestamp(), lastSeen: serverTimestamp(), visitCount: 1,
      firstSource: source, device, os, ...zero,
    });
    track('session_start', source);
  } else {
    const last = snap.data().lastSeen;
    const newVisit = !last || Date.now() - last.toMillis() > SESSION_GAP;
    await setDoc(vref, {
      lastSeen: serverTimestamp(), device, os,
      ...(newVisit ? { visitCount: increment(1) } : {}),
    }, { merge: true });
    if (newVisit) track('session_start', source);
  }
  return true;
}

// 이벤트 하나. meta는 짧은 분류 문자열만 (글귀 내용 금지)
export function track(type, meta) {
  if (store.mode !== 'firebase') {
    console.debug('[통계·체험 모드]', type, meta ?? '');
    return;
  }
  const { date, hour } = kst();
  queue.push({ type, meta: meta == null ? null : String(meta).slice(0, 40), date, hour });
  const counter = COUNTER_FOR[type];
  if (counter) bumps[counter] = (bumps[counter] || 0) + 1;
}

async function flush() {
  if (flushing || (!queue.length && !Object.keys(bumps).length)) return;
  flushing = true;
  try {
    if (!(await ready) || !fbRef) {
      queue = [];
      bumps = {};
      return;
    }
    const { fb, vref } = fbRef;
    const { doc, collection, writeBatch, serverTimestamp, increment } = fb.fs;
    const items = queue.splice(0, MAX_PER_BATCH);
    const counts = bumps;
    bumps = {};
    const batch = writeBatch(fb.db);
    for (const e of items) {
      batch.set(doc(collection(fb.db, 'events')), {
        uid: fb.uid,
        type: e.type,
        at: serverTimestamp(),
        date: e.date,
        hour: e.hour,
        device,
        typeDate: `${e.type}_${e.date}`,
        typeHour: `${e.type}_${e.hour}`,
        ...(e.meta ? { meta: e.meta } : {}),
      });
    }
    const inc = Object.fromEntries(Object.entries(counts).map(([k, n]) => [k, increment(n)]));
    batch.set(vref, { lastSeen: serverTimestamp(), ...inc }, { merge: true });
    await batch.commit();
  } catch (err) {
    // 통계 저장이 실패해도 서비스는 그대로 (다시 쌓이지 않게 버린다)
    console.warn('통계를 저장하지 못했어요', err);
  } finally {
    flushing = false;
  }
}
