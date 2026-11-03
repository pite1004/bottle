// 바닷소리: 파일 없이 Web Audio로 합성한다.
// 브라운 노이즈 → 저역 통과 필터, 느린 LFO 두 개(0.08·0.12Hz)로 파도 크기 변화 + 약한 바람(대역 통과 노이즈).
// 브라우저 정책상 첫 사용자 동작 이후에만 재생된다.

const VOLUME = 0.55;

let ctx = null;
let master = null;
let enabled = true;
let unlocked = false;
let deferred = false; // 인트로 동안에는 탭해도 켜지 않는다 ("이야기 들어보기"에서 시작)

function noiseBuffer(c, seconds, brown) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buf;
}

function loop(c, buffer) {
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.start();
  return src;
}

function lfo(c, freq, depth, target) {
  const osc = c.createOscillator();
  osc.frequency.value = freq;
  const gain = c.createGain();
  gain.gain.value = depth;
  osc.connect(gain).connect(target);
  osc.start();
}

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // 파도
  const waves = loop(ctx, noiseBuffer(ctx, 6, true));
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 520;
  const swell = ctx.createGain();
  swell.gain.value = 0.55;
  waves.connect(lowpass).connect(swell).connect(master);
  lfo(ctx, 0.08, 0.25, swell.gain);
  lfo(ctx, 0.12, 0.15, swell.gain);
  lfo(ctx, 0.1, 160, lowpass.frequency); // 파도가 클 때 조금 더 밝게

  // 바람
  const wind = loop(ctx, noiseBuffer(ctx, 4, false));
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 900;
  band.Q.value = 0.7;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.035;
  wind.connect(band).connect(windGain).connect(master);
  lfo(ctx, 0.05, 0.02, windGain.gain);
  lfo(ctx, 0.07, 300, band.frequency);
}

function fadeTo(value, seconds = 1.2) {
  if (!ctx) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(value, now + seconds);
}

function apply() {
  if (!unlocked) return;
  if (enabled) {
    if (!ctx) build();
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    fadeTo(VOLUME, 2);
  } else if (ctx) {
    fadeTo(0, 0.6);
  }
}

// 사용자 동작(탭·키 입력) 때마다 소리가 멈춰 있으면 다시 켠다.
// 폰 브라우저는 손가락을 "뗄 때"(pointerup·touchend·click)만 재생을 허락하고,
// 다른 앱에 갔다 오면 소리를 멈춰 두기 때문에 한 번만 시도하면 안 된다.
function onGesture() {
  if (deferred) return;
  unlocked = true;
  if (!enabled) return;
  if (!ctx || ctx.state !== 'running') apply();
}

// 인트로가 도는 동안 true. false로 풀 때는 사용자 동작(클릭) 안에서 불러야 바로 소리가 난다.
export function defer(on) {
  deferred = on;
  if (on) {
    if (ctx) fadeTo(0, 0.4);
  } else {
    onGesture();
    if (ctx && enabled) fadeTo(VOLUME, 2);
  }
}

export function setup(initialOn) {
  enabled = initialOn;
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) {
    window.addEventListener(type, onGesture, { capture: true, passive: true });
  }
  // 다른 탭·앱으로 가면 멈추고, 돌아오면 다시 (막히면 다음 탭에서 onGesture가 켠다)
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (enabled) ctx.resume().catch(() => {});
  });
  // 아이폰 Safari는 뒤로 가기 캐시에서 돌아올 때 visibilitychange 대신 pageshow만 오기도 한다
  window.addEventListener('pageshow', () => {
    if (ctx && enabled) ctx.resume().catch(() => {});
  });
}

export function setEnabled(on) {
  enabled = on;
  apply();
}

// 바다가 보낸 병이 나타날 때: 작은 종소리 (맑은 사인파 세 개가 차례로 울리고 사라진다)
export function chime() {
  if (!ctx || !enabled || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  [1318.5, 1975.5, 2637].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const t = now + i * 0.12;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 / (i + 1), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 1.7);
  });
}

// 병을 띄울 때 잠깐 줄였다가 되돌린다.
export function dip() {
  if (!ctx || !enabled) return;
  fadeTo(VOLUME * 0.25, 0.8);
  setTimeout(() => { if (enabled) fadeTo(VOLUME, 2.5); }, 2200);
}
