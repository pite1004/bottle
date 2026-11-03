// 10 내 병의 여정: 병 하나가 바다를 건너 몇 명에게 닿았는지.
// 건진 시각·시간대는 bottles/{id}/catches 하위 문서에서 온다 (누가 건졌는지는 보여 주지 않는다).

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const MAX_DOTS = 24; // 점이 이보다 많으면 날짜별로 묶는다

export const TOD_LABEL = { day: '낮', sunset: '노을', night: '밤' };
const TOD_WORD = { day: '낮에', sunset: '노을 질 때', night: '밤에' };

const $ = (id) => document.getElementById(id);

function kstDate(ms) {
  return new Date(ms + 9 * HOUR).toISOString().slice(0, 10);
}

// "N분 / N시간 / N일"
export function spanWords(ms) {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MIN))}분`;
  if (ms < 2 * DAY) return `${Math.round(ms / HOUR)}시간`;
  return `${Math.round(ms / DAY)}일`;
}

export function computeJourney(bottle, catches, now = Date.now()) {
  const created = bottle.createdAt;
  const span = Math.max(now - created, 1);
  const counts = { day: 0, sunset: 0, night: 0 };
  for (const c of catches) if (counts[c.timeOfDay] != null) counts[c.timeOfDay] += 1;

  // 타임라인 점: 많으면 날짜별로 묶어서 점 하나에 사람 수
  let points;
  if (catches.length <= MAX_DOTS) {
    points = catches.map((c) => ({ pos: (c.at - created) / span, n: 1 }));
  } else {
    const byDay = new Map();
    for (const c of catches) {
      const d = kstDate(c.at);
      const g = byDay.get(d) || { sum: 0, n: 0 };
      g.sum += c.at;
      g.n += 1;
      byDay.set(d, g);
    }
    points = [...byDay.values()].map((g) => ({ pos: (g.sum / g.n - created) / span, n: g.n }));
  }

  const reached = Math.max(bottle.catches || 0, catches.length);
  const first = catches[0];
  const latest = catches[catches.length - 1];
  return {
    id: bottle.id,
    look: { shape: bottle.shape, color: bottle.color, cork: bottle.cork, inside: bottle.inside },
    text: bottle.text,
    font: bottle.font,
    createdAt: created,
    reached,
    stars: bottle.stars || 0,
    days: Math.floor((now - created) / DAY) + 1,
    firstDelay: first ? first.at - created : null,
    latestAgo: latest ? now - latest.at : null,
    latestTod: latest ? latest.timeOfDay : null,
    counts,
    recorded: catches.length,
    untracked: Math.max(0, reached - catches.length), // 하위 문서가 생기기 전에 건진 사람
    points: points.map((p) => ({ pos: Math.max(0, Math.min(1, p.pos)), n: p.n })),
    grouped: catches.length > MAX_DOTS,
  };
}

// 작은 숫자들 (화면·카드 공용)
export function journeyFacts(j) {
  const facts = [`${j.days}일째 떠다니는 중`];
  if (j.reached > 0) facts.unshift(`${j.stars}명이 마음에 담았어요`);
  if (j.firstDelay != null) facts.push(`띄운 지 ${spanWords(j.firstDelay)} 만에 첫 사람이 건졌어요`);
  if (j.latestAgo != null) {
    facts.push(`가장 최근엔 ${spanWords(j.latestAgo)} 전, 누군가 ${TOD_WORD[j.latestTod] || ''} 읽었어요`);
  }
  return facts;
}

export function todShares(j) {
  const total = j.counts.day + j.counts.sunset + j.counts.night;
  return ['day', 'sunset', 'night'].map((k) => ({
    key: k,
    label: TOD_LABEL[k],
    n: j.counts[k],
    pct: total ? Math.round((j.counts[k] / total) * 100) : 0,
  }));
}

function formatMD(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, '0')}`;
}

export function renderJourneyView(j, hideText, svg) {
  $('journey-bottle').innerHTML = svg;
  const text = $('journey-text');
  if (hideText) {
    text.textContent = '글귀를 가렸어요';
    text.className = 'journey-text hidden-text';
  } else {
    text.textContent = j.text;
    text.className = `journey-text font-${j.font}`;
  }

  $('journey-big').textContent = j.reached > 0 ? `${j.reached}명에게 닿았어요` : '아직 바다를 건너는 중이에요';
  const sub = $('journey-sub');
  sub.hidden = j.reached > 0;
  sub.textContent = '누군가 건져주길 기다려요';

  $('journey-facts').innerHTML = journeyFacts(j).map((f) => `<li>${f}</li>`).join('');

  const tod = $('journey-tod');
  tod.hidden = j.recorded === 0;
  tod.innerHTML = todShares(j).map((t) => `
    <div class="tod-row tod-${t.key}">
      <span>${t.label}</span>
      <div class="tod-track"><div class="tod-fill" style="width:${t.pct}%"></div></div>
      <span class="tod-num">${t.pct}%</span>
    </div>`).join('');

  const maxN = Math.max(1, ...j.points.map((p) => p.n));
  $('journey-timeline').innerHTML = `
    <div class="tl-track">
      ${j.points.map((p) => {
        const size = j.grouped ? 8 + (p.n / maxN) * 12 : 10;
        return `<span class="tl-dot" style="left:${(p.pos * 100).toFixed(2)}%;width:${size}px;height:${size}px" title="${p.n}명"></span>`;
      }).join('')}
    </div>
    <div class="tl-labels"><span>${formatMD(j.createdAt)} 띄움</span><span>지금</span></div>
    ${j.grouped ? '<p class="tl-note">점 하나가 하루예요. 클수록 많은 사람이 건졌어요.</p>' : ''}
    ${j.untracked > 0 ? `<p class="tl-note">여정 기록이 생기기 전에 건진 ${j.untracked}명은 숫자에만 들어가요.</p>` : ''}`;
}
