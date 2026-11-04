// 사용법 안내: 한 번만 뜨는 말풍선(코치마크)과, 건진 것이 보관함으로 날아가는 연출.
import { load, save } from './store.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const $ = (id) => document.getElementById(id);

export const COACH = {
  caught: '건진 편지는 여기 모여요',
  sent: '내 병이 몇 명에게 닿았는지 여기서 볼 수 있어요',
  trash: '모은 쓰레기는 꾸미기 재료가 돼요',
  idle: '병을 탭해보세요',
  dream: '꿈꾸기가 열렸어요. 달을 눌러보세요',
};

export function coachSeen(key) {
  return load(`bottle.coach.${key}`, false);
}

// app 좌표(#app 왼쪽 위 기준)로 바꾼 사각형
function rectIn(app, r) {
  const a = app.getBoundingClientRect();
  return { left: r.left - a.left, top: r.top - a.top, width: r.width, height: r.height, appW: a.width };
}

export function createCoach(app) {
  const box = $('coach');
  const text = $('coach-text');
  let current = null;
  let follow = 0;

  // getTarget: () => DOMRect 비슷한 것({left, top, width, height}, 화면 좌표) 또는 null
  // place: 'below'(대상 아래, 꼬리 위) | 'above'(대상 위, 꼬리 아래)
  // repeat: 한 번만이 아니라 다시 띄울 수 있는 말풍선
  function show(key, getTarget, place = 'below', repeat = false) {
    if (current || (!repeat && coachSeen(key))) return false;
    const first = getTarget();
    if (!first) return false;
    if (!repeat) save(`bottle.coach.${key}`, true);
    current = key;
    text.textContent = COACH[key];
    box.className = `coach ${place} coach-${key}`;
    box.hidden = false;

    const position = () => {
      const t = getTarget();
      if (!t) return close();
      const r = rectIn(app, t);
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      const cx = r.left + r.width / 2;
      const left = Math.max(12, Math.min(r.appW - w - 12, cx - w / 2));
      const top = place === 'below' ? r.top + r.height + 12 : r.top - h - 12;
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.setProperty('--arrow-x', `${Math.max(16, Math.min(w - 16, cx - left))}px`);
    };
    position();
    follow = setInterval(position, 60); // 출렁이는 병을 따라간다
    box.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }],
      { duration: reducedMotion.matches ? 1 : 250, easing: 'ease-out' });
    return true;
  }

  function close() {
    if (!current) return;
    clearInterval(follow);
    current = null;
    box.hidden = true;
  }

  // 아무 데나 탭하면 닫힘 (탭 자체는 그대로 전달된다)
  document.addEventListener('pointerdown', close, true);
  document.addEventListener('keydown', close, true);

  return {
    show,
    close,
    get visible() { return !!current; },
  };
}

// 건진 것(병 썸네일·쓰레기)이 작아지며 보관함 아이콘으로 날아간다. 움직임 줄이기면 바로 끝.
export function flyTo(app, fromRect, svg, target) {
  if (reducedMotion.matches || !fromRect) return Promise.resolve();
  const from = rectIn(app, fromRect);
  const to = rectIn(app, target.getBoundingClientRect());
  const el = document.createElement('div');
  el.className = 'fly';
  el.innerHTML = svg;
  Object.assign(el.style, {
    left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`,
  });
  app.appendChild(el);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const s = Math.max(0.12, (to.height * 0.7) / from.height);
  return new Promise((resolve) => {
    el.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.45}px, ${dy * 0.35 - 40}px) scale(${(1 + s) / 2})`, opacity: 1, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(${s})`, opacity: 0.6 },
      ],
      { duration: 750, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards' },
    ).onfinish = () => {
      el.remove();
      resolve();
    };
  });
}

// 아이콘이 살짝 튄다
export function bounce(el) {
  if (reducedMotion.matches) return;
  el.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.22)' }, { transform: 'scale(.95)' }, { transform: 'scale(1)' }],
    { duration: 420, easing: 'ease-out' },
  );
}
