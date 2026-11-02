// 바닷소리: 파일 없이 Web Audio로 합성한다.
// 브라운 노이즈 → 저역 통과 필터, 느린 LFO 두 개(0.08·0.12Hz)로 파도 크기 변화 + 약한 바람(대역 통과 노이즈).
// 브라우저 정책상 첫 사용자 동작 이후에만 재생된다.

const VOLUME = 0.55;

let ctx = null;
let master = null;
let enabled = true;
let unlocked = false;

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
    ctx.resume();
    fadeTo(VOLUME, 2);
  } else if (ctx) {
    fadeTo(0, 0.6);
  }
}

// 첫 사용자 동작(탭·키 입력)에서 소리를 연다.
export function setup(initialOn) {
  enabled = initialOn;
  const unlock = () => {
    unlocked = true;
    apply();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  // 다른 탭으로 가면 멈추고, 돌아오면 다시
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (enabled) ctx.resume();
  });
}

export function setEnabled(on) {
  enabled = on;
  apply();
}

// 병을 띄울 때 잠깐 줄였다가 되돌린다.
export function dip() {
  if (!ctx || !enabled) return;
  fadeTo(VOLUME * 0.25, 0.8);
  setTimeout(() => { if (enabled) fadeTo(VOLUME, 2.5); }, 2200);
}
