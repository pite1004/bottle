// 구글 애널리틱스(GA4). 화면 이동과 앱 통계 이벤트를 같이 보낸다.
// 광고용 기능(구글 신호·광고 맞춤)은 끈다. 글귀 내용은 보내지 않는다 (이벤트 이름과 짧은 분류 값만).
// 내 컴퓨터에서 미리 보기(localhost) 할 때는 보내지 않는다.

const MEASUREMENT_ID = 'G-VFEXFQ3V1L';
const enabled = !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

if (enabled) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, {
    send_page_view: false, // 화면은 '#' 주소로 바뀌어서 아래 pageView로 따로 보낸다
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(s);
}

let lastScreen = null;

// 화면 이름(sea, letter, archive …)을 /sea 같은 주소로 보낸다
export function pageView(screen) {
  if (!enabled || screen === lastScreen) return;
  lastScreen = screen;
  window.gtag('event', 'page_view', {
    page_location: `${location.origin}/${screen}`,
    page_title: screen,
  });
}

// 앱 통계(stats.js)의 이벤트를 그대로. meta는 짧은 분류 문자열뿐
export function event(type, meta) {
  if (!enabled) return;
  window.gtag('event', type, meta == null ? {} : { meta: String(meta).slice(0, 40) });
}
