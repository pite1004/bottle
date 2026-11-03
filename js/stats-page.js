// stats.html: 발표용 통계. 모든 숫자는 count() / sum() 집계 쿼리로 계산해서 읽기 비용을 줄인다.
// 글귀 내용은 어디에도 표시하지 않는다.
import { firebaseConfig } from '../firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/13.1.0';
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

const SOURCES = [
  ['card', '편지 카드'], ['journey', '여정 카드'], ['record', '기록 카드'],
  ['instagram', '인스타그램'], ['kakao', '카카오톡'], ['other', '기타 사이트'], ['direct', '직접 접속'],
];
const BLOCKS = [['contact', '연락처'], ['link', '링크'], ['profanity', '욕설·비하'], ['repeat', '같은 글자 반복'], ['crisis', '위기 문구']];
const SEA = [['trash5', '쓰레기 5개'], ['letters5', '편지 5통'], ['letters10', '편지 10통'], ['reached', '내 병이 처음 닿음']];

let db, fs;
let dailyRows = [];

async function connect() {
  if (db) return;
  if (!firebaseConfig || !firebaseConfig.apiKey) throw new Error('firebase-config.js가 비어 있어요 (체험 모드에서는 통계가 없어요)');
  const [{ initializeApp }, firestore] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  fs = firestore;
  db = fs.getFirestore(initializeApp(firebaseConfig));
}

// ---------- 집계 도우미 ----------
const col = (name) => fs.collection(db, name);
const where = (name, ...conds) => fs.query(col(name), ...conds.map(([f, o, v]) => fs.where(f, o, v)));
const count = async (q) => (await fs.getCountFromServer(q)).data().count;
const sum = async (q, field) => (await fs.getAggregateFromServer(q, { v: fs.sum(field) })).data().v || 0;
const ev = (...conds) => where('events', ...conds);

// 한꺼번에 너무 많은 요청을 보내지 않게 8개씩
async function all(tasks, size = 8) {
  const out = [];
  for (let i = 0; i < tasks.length; i += size) {
    out.push(...(await Promise.all(tasks.slice(i, i + size).map((t) => t()))));
  }
  return out;
}

// 한국 시간 기준 최근 n일 날짜 ('YYYY-MM-DD', 오래된 것부터)
function lastDays(n) {
  const out = [];
  const now = Date.now() + 9 * 3600 * 1000;
  for (let i = n - 1; i >= 0; i--) out.push(new Date(now - i * 86400000).toISOString().slice(0, 10));
  return out;
}

// ---------- 그리기 ----------
function bars(el, rows, { showPct = true } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((a, r) => a + r.value, 0);
  el.innerHTML = rows.map((r) => `
    <div class="bar-row">
      <span>${r.label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(r.value / max) * 100}%"></div></div>
      <span class="num">${fmt(r.value)}${r.note ? ` <small>${r.note}</small>` : showPct ? ` <small>${pct(r.value, total)}</small>` : ''}</span>
    </div>`).join('');
}

function bigNumbers(items) {
  $('big').innerHTML = items.map((i) => `
    <div class="card"><dt>${i.label}</dt><dd>${fmt(i.value)}${i.unit ? `<small>${i.unit}</small>` : ''}</dd></div>`).join('');
}

// ---------- 불러오기 ----------
async function load() {
  const btn = $('refresh-btn');
  btn.disabled = true;
  $('error').hidden = true;
  $('updated').textContent = '불러오는 중…';
  try {
    await connect();

    // 큰 숫자
    const [
      visitors, revisit, bottles, letters, catchers, trash, shares, saves, viaCard,
      allTen, launchers, launchedSum,
    ] = await all([
      () => count(col('visitors')),
      () => count(where('visitors', ['visitCount', '>=', 2])),
      () => count(col('bottles')),
      () => sum(col('bottles'), 'catches'),
      () => count(where('visitors', ['lettersCaught', '>=', 1])),
      () => sum(col('visitors'), 'trashCaught'),
      () => count(ev(['type', '==', 'share_card'])),
      () => count(ev(['type', '==', 'save_image'])),
      () => count(where('visitors', ['firstSource', 'in', ['card', 'journey', 'record']])),
      () => count(where('visitors', ['bottlesLaunched', '>=', 10])),
      () => count(where('visitors', ['bottlesLaunched', '>=', 1])),
      () => sum(col('visitors'), 'bottlesLaunched'),
    ]);
    bigNumbers([
      { label: '참여자 수', value: visitors, unit: '명' },
      { label: '다시 찾아온 사람', value: revisit, unit: '명' },
      { label: '바다에 띄운 병', value: bottles, unit: '개' },
      { label: '오간 편지 (건져진 횟수)', value: letters, unit: '통' },
      { label: '편지를 건진 사람', value: catchers, unit: '명' },
      { label: '바다에서 건져낸 쓰레기', value: trash, unit: '개' },
      { label: '공유 · 저장', value: shares + saves, unit: `회 (공유 ${fmt(shares)} · 저장 ${fmt(saves)})` },
      { label: '공유 카드로 들어온 사람', value: viaCard, unit: '명' },
      { label: '병 10개를 모두 띄운 사람', value: allTen, unit: '명' },
      { label: '병을 띄운 사람 1인당 평균', value: launchers ? Math.round((launchedSum / launchers) * 10) / 10 : 0, unit: '개' },
    ]);

    // 퍼널 (각 단계를 한 번이라도 한 사람)
    const steps = [
      ['방문', null], ['인트로 완료', 'introCompletes'], ['첫 던짐', 'castCount'], ['첫 건짐', 'lettersCaught'],
      ['글쓰기 시작', 'writeStarts'], ['병 띄움', 'bottlesLaunched'], ['공유', 'shareCount'],
    ];
    const funnel = await all(steps.map(([, f]) => () => (f ? count(where('visitors', [f, '>=', 1])) : count(col('visitors')))));
    bars($('funnel'), steps.map(([label], i) => ({
      label,
      value: funnel[i],
      note: i === 0 ? '' : `${pct(funnel[i], funnel[0])} (${pct(funnel[i], funnel[i - 1])})`,
    })));

    // 최근 14일
    const days = lastDays(14);
    const kinds = [['session_start'], ['bottle_launch'], ['catch_letter'], ['share_card', 'save_image']];
    const dayCounts = await all(days.flatMap((d) => kinds.map((types) => async () => {
      const n = await Promise.all(types.map((t) => count(ev(['typeDate', '==', `${t}_${d}`]))));
      return n.reduce((a, b) => a + b, 0);
    })));
    dailyRows = days.map((d, i) => ({
      date: d,
      visits: dayCounts[i * 4],
      launched: dayCounts[i * 4 + 1],
      caught: dayCounts[i * 4 + 2],
      shared: dayCounts[i * 4 + 3],
    }));
    $('daily').innerHTML = `<tr><th>날짜</th><th>방문</th><th>띄운 병</th><th>건진 편지</th><th>공유·저장</th></tr>`
      + dailyRows.slice().reverse().map((r) => `<tr><td>${r.date.slice(5).replace('-', '.')}</td><td>${fmt(r.visits)}</td><td>${fmt(r.launched)}</td><td>${fmt(r.caught)}</td><td>${fmt(r.shared)}</td></tr>`).join('');
    $('csv-btn').disabled = false;

    // 시간대별 건진 편지
    const hours = await all([...Array(24).keys()].map((h) => () => count(ev(['typeHour', '==', `catch_letter_${h}`]))));
    const hmax = Math.max(1, ...hours);
    $('hourly').innerHTML = hours.map((n, h) => `
      <div class="col" title="${h}시 ${n}통"><b>${n || ''}</b><div class="stick" style="height:${(n / hmax) * 100}%"></div><span>${h}</span></div>`).join('');

    // 유입 경로 · 기기
    const src = await all(SOURCES.map(([k]) => () => count(where('visitors', ['firstSource', '==', k]))));
    bars($('sources'), SOURCES.map(([, label], i) => ({ label, value: src[i] })));
    const dev = await all([
      () => count(where('visitors', ['device', '==', 'mobile'])),
      () => count(where('visitors', ['device', '==', 'desktop'])),
      () => count(where('visitors', ['os', '==', 'ios'])),
      () => count(where('visitors', ['os', '==', 'android'])),
      () => count(where('visitors', ['os', '==', 'other'])),
    ]);
    bars($('devices'), [
      { label: '모바일', value: dev[0], note: pct(dev[0], dev[0] + dev[1]) },
      { label: 'PC', value: dev[1], note: pct(dev[1], dev[0] + dev[1]) },
      { label: 'iOS', value: dev[2], note: pct(dev[2], dev[2] + dev[3] + dev[4]) },
      { label: '안드로이드', value: dev[3], note: pct(dev[3], dev[2] + dev[3] + dev[4]) },
      { label: '그 밖', value: dev[4], note: pct(dev[4], dev[2] + dev[3] + dev[4]) },
    ]);

    // 안전 · 검열 (차단된 글의 내용은 저장하지 않고 이유만)
    const blocked = await all(BLOCKS.map(([k]) => () => count(ev(['type', '==', 'write_blocked'], ['meta', '==', k]))));
    const [reports, hidden] = await all([
      () => count(ev(['type', '==', 'letter_report'])),
      () => count(where('bottles', ['hidden', '==', true])),
    ]);
    bars($('safety'), [
      ...BLOCKS.map(([, label], i) => ({ label: `차단: ${label}`, value: blocked[i], note: '회' })),
      { label: '신고', value: reports, note: '회' },
      { label: '숨김 처리된 병', value: hidden, note: '개' },
    ]);

    // 도달 · 바다가 보낸 병
    const top = await fs.getDocs(fs.query(col('bottles'), fs.orderBy('catches', 'desc'), fs.limit(1)));
    const best = top.empty ? 0 : top.docs[0].data().catches || 0; // 글귀는 읽기만 하고 표시하지 않는다
    const sea = await all(SEA.map(([k]) => () => count(ev(['type', '==', 'catch_sea_bottle'], ['meta', '==', k]))));
    bars($('reach'), [
      { label: '병 1개당 평균', value: bottles ? Math.round((letters / bottles) * 10) / 10 : 0, note: '명' },
      { label: '가장 많이 닿은 병', value: best, note: '명' },
      ...SEA.map(([, label], i) => ({ label: `바다가 보낸 병: ${label}`, value: sea[i], note: '명' })),
    ], { showPct: false });

    $('updated').textContent = `마지막 갱신 ${new Date().toLocaleString('ko-KR', { hour12: false })}`;
  } catch (err) {
    console.error(err);
    $('error').hidden = false;
    $('error').textContent = `통계를 불러오지 못했어요: ${err.message}`;
    $('updated').textContent = '';
  } finally {
    btn.disabled = false;
  }
}

function downloadCsv() {
  const head = '날짜,방문,띄운 병,건진 편지,공유·저장';
  const lines = dailyRows.map((r) => [r.date, r.visits, r.launched, r.caught, r.shared].join(','));
  const blob = new Blob(['﻿' + [head, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bottle-stats-${dailyRows.at(-1)?.date || 'daily'}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

$('refresh-btn').addEventListener('click', load);
$('csv-btn').addEventListener('click', downloadCsv);
load();
